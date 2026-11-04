import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { deliveryAddresses, emailVerificationTokens, favoriteMenuItems, favoriteRestaurants, menuItems, passwordResetTokens, restaurants, users } from "../drizzle/schema";
import { getDb } from "./db";
import { emailProviderStatus, sendPasswordResetEmail, sendVerificationEmail } from "./_core/mailer";
const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const validatePassword = (value: string) => value.length >= 10 && /[A-ZА-Я]/.test(value) && /[a-zа-я]/.test(value) && /\d/.test(value);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const hashPassword = (password: string) => { const salt = randomBytes(16).toString("hex"); const derived = scryptSync(password, salt, 64).toString("hex"); return `scrypt$${salt}$${derived}`; };
const verifyPassword = (password: string, encoded: string) => { const [, salt, expected] = encoded.split("$"); if (!salt || !expected) return false; const actual = scryptSync(password, salt, 64); const expectedBuffer = Buffer.from(expected, "hex"); return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer); };
const rawToken = () => randomBytes(32).toString("base64url");

export async function registerEmailAccount(input: { name: string; email: string; password: string; acceptTerms: boolean; acceptPrivacy: boolean }) {
  if (!input.acceptTerms || !input.acceptPrivacy) throw new Error("CONSENTS_REQUIRED");
  if (!validatePassword(input.password)) throw new Error("WEAK_PASSWORD");
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const email = normalizeEmail(input.email);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new Error("EMAIL_ALREADY_EXISTS");
  const openId = `email_${randomBytes(18).toString("hex")}`;
  const now = new Date();
  const inserted = await db.insert(users).values({ openId, name: input.name.trim(), email, passwordHash: hashPassword(input.password), loginMethod: "email", termsAcceptedAt: now, privacyAcceptedAt: now, authVersion: 1 });
  const userId = Number(inserted[0].insertId);
  const token = rawToken();
  await db.insert(emailVerificationTokens).values({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) });
  try {
    await sendVerificationEmail(email, token);
  } catch {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    throw new Error("EMAIL_DELIVERY_FAILED");
  }
  return { userId, email, emailDeliveryAvailable: true, providerMessage: emailProviderStatus().message };
}

export async function resendEmailVerification(emailInput: string) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const email = normalizeEmail(emailInput);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.emailVerifiedAt) return { accepted: true, emailDeliveryAvailable: true, providerMessage: "Если аккаунт существует и не подтверждён, письмо будет отправлено." };
  const [recent] = await db.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens).where(and(eq(emailVerificationTokens.userId, user.id), gt(emailVerificationTokens.createdAt, new Date(Date.now() - 60_000)))).limit(1);
  if (recent) throw new Error("RESEND_TOO_SOON");
  const token = rawToken();
  await db.insert(emailVerificationTokens).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) });
  try {
    await sendVerificationEmail(email, token);
  } catch {
    await db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(and(eq(emailVerificationTokens.userId, user.id), eq(emailVerificationTokens.tokenHash, hashToken(token))));
    throw new Error("EMAIL_DELIVERY_FAILED");
  }
  return { accepted: true, emailDeliveryAvailable: true, providerMessage: emailProviderStatus().message };
}

export async function verifyEmailAddress(token: string) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(emailVerificationTokens).where(and(eq(emailVerificationTokens.tokenHash, hashToken(token)), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, new Date()))).limit(1);
  if (!row) throw new Error("INVALID_VERIFICATION_TOKEN");
  await db.transaction(async (tx) => { await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, row.id)); await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId)); });
  return { verified: true };
}

export async function authenticateEmail(emailInput: string, password: string) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const email = normalizeEmail(emailInput);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.passwordHash) throw new Error("INVALID_CREDENTIALS");
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("LOGIN_RATE_LIMITED");
  if (!verifyPassword(password, user.passwordHash)) {
    const failures = user.failedLoginCount + 1;
    await db.update(users).set({ failedLoginCount: failures, lockedUntil: failures >= MAX_LOGIN_FAILURES ? new Date(Date.now() + LOCK_MS) : null }).where(eq(users.id, user.id));
    throw new Error(failures >= MAX_LOGIN_FAILURES ? "LOGIN_RATE_LIMITED" : "INVALID_CREDENTIALS");
  }
  if (!user.emailVerifiedAt) throw new Error("EMAIL_NOT_VERIFIED");
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastSignedIn: new Date() }).where(eq(users.id, user.id));
  return { ...user, authVersion: user.authVersion };
}

export async function requestPasswordReset(emailInput: string) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const email = normalizeEmail(emailInput);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user?.passwordHash) {
    const [recent] = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, new Date(Date.now() - 60_000)))).limit(1);
    if (!recent) {
      const token = rawToken();
      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
      try {
        await sendPasswordResetEmail(email, token);
      } catch {
        await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.tokenHash, hashToken(token))));
        throw new Error("EMAIL_DELIVERY_FAILED");
      }
    }
  }
  return { accepted: true, emailDeliveryAvailable: true, providerMessage: "Если аккаунт существует, письмо с инструкциями отправлено." };
}

export async function resetPassword(token: string, password: string) {
  if (!validatePassword(password)) throw new Error("WEAK_PASSWORD");
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1);
  if (!row) throw new Error("INVALID_RESET_TOKEN");
  await db.transaction(async (tx) => { await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id)); await tx.update(users).set({ passwordHash: hashPassword(password), authVersion: sqlIncrement(users.authVersion), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, row.userId)); });
  return { reset: true };
}

function sqlIncrement(column: typeof users.authVersion) { return sql`${column} + 1`; }

export async function getAccountProfile(userId: number) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const [user] = await db.select({ id: users.id, name: users.name, email: users.email, emailVerifiedAt: users.emailVerifiedAt, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, loginMethod: users.loginMethod }).from(users).where(eq(users.id, userId)).limit(1); if (!user) throw new Error("USER_NOT_FOUND"); return user; }
export async function updateAccountProfile(userId: number, input: { name: string; phone?: string }) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const [current] = await db.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1); const nextPhone = input.phone?.trim() || null; if (current?.phoneVerifiedAt && nextPhone !== current.phone) throw new Error("PHONE_CHANGE_REQUIRES_CONFIRMATION"); await db.update(users).set({ name: input.name.trim(), phone: nextPhone }).where(eq(users.id, userId)); return getAccountProfile(userId); }

export async function listAddresses(userId: number) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); return db.select().from(deliveryAddresses).where(eq(deliveryAddresses.userId, userId)).orderBy(desc(deliveryAddresses.isDefault), asc(deliveryAddresses.id)); }
export async function createAddress(userId: number, input: { city: string; street: string; house: string; entrance?: string; floor?: string; apartment?: string; intercom?: string; comment?: string; isDefault?: boolean }) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const address = { userId, city: input.city.trim(), street: input.street.trim(), house: input.house.trim(), entrance: input.entrance?.trim() || null, floor: input.floor?.trim() || null, apartment: input.apartment?.trim() || null, intercom: input.intercom?.trim() || null, comment: input.comment?.trim() || null, isDefault: input.isDefault ? 1 : 0 }; const result = await db.transaction(async (tx) => { if (address.isDefault) await tx.update(deliveryAddresses).set({ isDefault: 0 }).where(eq(deliveryAddresses.userId, userId)); return tx.insert(deliveryAddresses).values(address); }); return { id: Number(result[0].insertId), ...address }; }
export async function updateAddress(userId: number, id: number, input: { city: string; street: string; house: string; entrance?: string; floor?: string; apartment?: string; intercom?: string; comment?: string; isDefault?: boolean }) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const [owned] = await db.select({ id: deliveryAddresses.id }).from(deliveryAddresses).where(and(eq(deliveryAddresses.id, id), eq(deliveryAddresses.userId, userId))).limit(1); if (!owned) throw new Error("ADDRESS_NOT_FOUND"); const values = { city: input.city.trim(), street: input.street.trim(), house: input.house.trim(), entrance: input.entrance?.trim() || null, floor: input.floor?.trim() || null, apartment: input.apartment?.trim() || null, intercom: input.intercom?.trim() || null, comment: input.comment?.trim() || null, isDefault: input.isDefault ? 1 : 0 }; await db.transaction(async (tx) => { if (values.isDefault) await tx.update(deliveryAddresses).set({ isDefault: 0 }).where(eq(deliveryAddresses.userId, userId)); await tx.update(deliveryAddresses).set(values).where(and(eq(deliveryAddresses.id, id), eq(deliveryAddresses.userId, userId))); }); return { id, ...values }; }
export async function deleteAddress(userId: number, id: number) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const result = await db.delete(deliveryAddresses).where(and(eq(deliveryAddresses.id, id), eq(deliveryAddresses.userId, userId))); if (!result[0].affectedRows) throw new Error("ADDRESS_NOT_FOUND"); return { deleted: true }; }
export async function setDefaultAddress(userId: number, id: number) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const [owned] = await db.select({ id: deliveryAddresses.id }).from(deliveryAddresses).where(and(eq(deliveryAddresses.id, id), eq(deliveryAddresses.userId, userId))).limit(1); if (!owned) throw new Error("ADDRESS_NOT_FOUND"); await db.transaction(async (tx) => { await tx.update(deliveryAddresses).set({ isDefault: 0 }).where(eq(deliveryAddresses.userId, userId)); await tx.update(deliveryAddresses).set({ isDefault: 1 }).where(eq(deliveryAddresses.id, id)); }); return { id, isDefault: true }; }

export async function listFavorites(userId: number) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const [favoriteRestaurantRows, favoriteDishRows] = await Promise.all([db.select({ favoriteId: favoriteRestaurants.id, restaurant: restaurants }).from(favoriteRestaurants).innerJoin(restaurants, eq(restaurants.id, favoriteRestaurants.restaurantId)).where(and(eq(favoriteRestaurants.userId, userId), eq(restaurants.status, "active"))), db.select({ favoriteId: favoriteMenuItems.id, dish: menuItems }).from(favoriteMenuItems).innerJoin(menuItems, eq(menuItems.id, favoriteMenuItems.menuItemId)).innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId)).where(and(eq(favoriteMenuItems.userId, userId), eq(restaurants.status, "active"), eq(menuItems.available, 1)))]); return { restaurants: favoriteRestaurantRows, dishes: favoriteDishRows }; }
export async function toggleFavorite(userId: number, type: "restaurant" | "dish", id: number, favorite: boolean) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); if (type === "restaurant") { const [row] = await db.select({ id: restaurants.id }).from(restaurants).where(and(eq(restaurants.id, id), eq(restaurants.status, "active"))).limit(1); if (!row) throw new Error("FAVORITE_TARGET_NOT_FOUND"); if (favorite) await db.insert(favoriteRestaurants).values({ userId, restaurantId: id }).onDuplicateKeyUpdate({ set: { restaurantId: id } }); else await db.delete(favoriteRestaurants).where(and(eq(favoriteRestaurants.userId, userId), eq(favoriteRestaurants.restaurantId, id))); } else { const [row] = await db.select({ id: menuItems.id }).from(menuItems).innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId)).where(and(eq(menuItems.id, id), eq(menuItems.available, 1), eq(restaurants.status, "active"))).limit(1); if (!row) throw new Error("FAVORITE_TARGET_NOT_FOUND"); if (favorite) await db.insert(favoriteMenuItems).values({ userId, menuItemId: id }).onDuplicateKeyUpdate({ set: { menuItemId: id } }); else await db.delete(favoriteMenuItems).where(and(eq(favoriteMenuItems.userId, userId), eq(favoriteMenuItems.menuItemId, id))); } return { type, id, favorite }; }

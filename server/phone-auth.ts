import { createHash, randomInt, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { phoneAuthChallenges, users } from "../drizzle/schema";
import { getDb } from "./db";
import { createBotDeepLink, hashBotState, type PhoneChannel, sendBotCode } from "./_core/bots";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const PHONE_RE = /^\+7\d{10}$/;

export type PhonePurpose = "register" | "login";

export function normalizePhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  if (!PHONE_RE.test(compact)) throw new Error("INVALID_PHONE");
  return compact;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function makeCode() {
  return String(randomInt(1000, 10000));
}

function safeEqualHex(value: string, expected: string) {
  const actualBuffer = Buffer.from(hashValue(value), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicChallenge(row: typeof phoneAuthChallenges.$inferSelect, deepLink?: string) {
  return {
    challengeId: row.id,
    channel: row.channel,
    deepLink,
    expiresAt: row.expiresAt,
    linked: Boolean(row.providerChatId),
    codeExpiresAt: row.codeExpiresAt,
    resendAvailableAt: row.resendAvailableAt,
  };
}

export async function requestPhoneChallenge(input: { phone: string; channel: PhoneChannel; purpose: PhonePurpose; name?: string; acceptTerms?: boolean; acceptPrivacy?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const phone = normalizePhone(input.phone);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (input.purpose === "register" && existing) throw new Error("PHONE_ALREADY_REGISTERED");
  if (input.purpose === "register" && (!input.name?.trim() || !input.acceptTerms || !input.acceptPrivacy)) throw new Error("CONSENTS_REQUIRED");
  const [recent] = await db.select({ id: phoneAuthChallenges.id }).from(phoneAuthChallenges).where(and(eq(phoneAuthChallenges.phone, phone), eq(phoneAuthChallenges.channel, input.channel), eq(phoneAuthChallenges.purpose, input.purpose), isNull(phoneAuthChallenges.consumedAt), gt(phoneAuthChallenges.createdAt, new Date(Date.now() - RESEND_INTERVAL_MS)))).limit(1);
  if (recent) throw new Error("CHALLENGE_TOO_SOON");
  const now = new Date();
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const inserted = await db.insert(phoneAuthChallenges).values({
    phone,
    channel: input.channel,
    purpose: input.purpose,
    stateHash: hashBotState(state),
    name: input.name?.trim() || null,
    termsAcceptedAt: input.acceptTerms ? now : null,
    privacyAcceptedAt: input.acceptPrivacy ? now : null,
    expiresAt,
  });
  const challengeId = Number(inserted[0].insertId);
  try {
    const deepLink = await createBotDeepLink(input.channel, state);
    const [row] = await db.select().from(phoneAuthChallenges).where(eq(phoneAuthChallenges.id, challengeId)).limit(1);
    if (!row) throw new Error("CHALLENGE_NOT_FOUND");
    return publicChallenge(row, deepLink);
  } catch (error) {
    await db.delete(phoneAuthChallenges).where(eq(phoneAuthChallenges.id, challengeId));
    throw error;
  }
}

export async function getPhoneChallengeStatus(challengeId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(phoneAuthChallenges).where(eq(phoneAuthChallenges.id, challengeId)).limit(1);
  if (!row || row.expiresAt <= new Date() || row.consumedAt) throw new Error("CHALLENGE_EXPIRED");
  return publicChallenge(row);
}

export async function handleBotStart(channel: PhoneChannel, state: string, providerUserId: string, providerChatId: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(phoneAuthChallenges).where(and(eq(phoneAuthChallenges.channel, channel), eq(phoneAuthChallenges.stateHash, hashBotState(state)), isNull(phoneAuthChallenges.consumedAt), gt(phoneAuthChallenges.expiresAt, new Date()))).limit(1);
  if (!row) throw new Error("CHALLENGE_EXPIRED");
  if (row.providerChatId && row.providerChatId !== providerChatId) throw new Error("CHALLENGE_ALREADY_LINKED");
  const now = new Date();
  if (row.codeHash && row.resendAvailableAt && row.resendAvailableAt > now) {
    return { challengeId: row.id, channel, chatId: channel === "max" ? row.providerUserId || providerChatId : providerChatId, code: null as string | null, alreadySent: true };
  }
  const code = makeCode();
  const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
  const resendAvailableAt = new Date(Date.now() + RESEND_INTERVAL_MS);
  await db.update(phoneAuthChallenges).set({ providerUserId, providerChatId, linkedAt: now, codeHash: hashValue(code), codeExpiresAt, resendAvailableAt, attempts: 0 }).where(eq(phoneAuthChallenges.id, row.id));
  return { challengeId: row.id, channel, chatId: channel === "max" ? providerUserId : providerChatId, code, alreadySent: false };
}

export async function deliverBotCode(result: { challengeId: number; channel: PhoneChannel; chatId: string; code: string | null; alreadySent: boolean }) {
  if (!result.code || result.alreadySent) return result;
  try {
    await sendBotCode(result.channel, result.chatId, result.code);
  } catch {
    const db = await getDb();
    if (db) await db.update(phoneAuthChallenges).set({ codeHash: null, codeExpiresAt: null, resendAvailableAt: null }).where(eq(phoneAuthChallenges.id, result.challengeId));
    throw new Error("BOT_DELIVERY_FAILED");
  }
  return result;
}

export async function verifyPhoneChallenge(challengeId: number, code: string) {
  if (!/^\d{4}$/.test(code)) throw new Error("INVALID_CODE");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(phoneAuthChallenges).where(eq(phoneAuthChallenges.id, challengeId)).limit(1);
  if (!row || row.expiresAt <= new Date() || row.consumedAt || !row.providerChatId || !row.codeHash || !row.codeExpiresAt || row.codeExpiresAt <= new Date()) throw new Error("CODE_EXPIRED");
  if (row.attempts >= MAX_CODE_ATTEMPTS) throw new Error("CODE_RATE_LIMITED");
  if (!safeEqualHex(code, row.codeHash)) {
    await db.update(phoneAuthChallenges).set({ attempts: row.attempts + 1 }).where(eq(phoneAuthChallenges.id, row.id));
    throw new Error(row.attempts + 1 >= MAX_CODE_ATTEMPTS ? "CODE_RATE_LIMITED" : "INVALID_CODE");
  }
  const [existing] = await db.select().from(users).where(eq(users.phone, row.phone)).limit(1);
  let user = existing;
  await db.transaction(async (tx) => {
    await tx.update(phoneAuthChallenges).set({ consumedAt: new Date(), verifiedAt: new Date() }).where(eq(phoneAuthChallenges.id, row.id));
    if (row.purpose === "register") {
      if (existing) throw new Error("PHONE_ALREADY_REGISTERED");
      const inserted = await tx.insert(users).values({ openId: `phone_${randomBytes(18).toString("hex")}`, name: row.name, phone: row.phone, phoneVerifiedAt: new Date(), authVersion: 1, termsAcceptedAt: row.termsAcceptedAt, privacyAcceptedAt: row.privacyAcceptedAt, loginMethod: row.channel });
      const userId = Number(inserted[0].insertId);
      const [created] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      user = created;
    } else {
      if (!existing || !existing.phoneVerifiedAt) throw new Error("PHONE_NOT_VERIFIED");
      await tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastSignedIn: new Date() }).where(eq(users.id, existing.id));
      user = { ...existing, failedLoginCount: 0, lockedUntil: null, lastSignedIn: new Date() };
    }
  });
  if (!user) throw new Error("USER_NOT_FOUND");
  return user;
}

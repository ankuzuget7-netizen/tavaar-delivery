import "dotenv/config";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { hashPassword, normalizeEmail, validatePassword } from "../server/account";
import { getDb } from "../server/db";

const emailInput = process.env.OWNER_ADMIN_EMAIL;
const password = process.env.OWNER_ADMIN_PASSWORD;
const name = process.env.OWNER_ADMIN_NAME?.trim() || "Владелец Таваар Доставка";

if (!emailInput || !password) throw new Error("OWNER_ADMIN_EMAIL and OWNER_ADMIN_PASSWORD are required");
if (!validatePassword(password)) throw new Error("OWNER_ADMIN_PASSWORD must be at least 10 characters and contain upper/lowercase letters and a digit");
const email = normalizeEmail(emailInput);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("OWNER_ADMIN_EMAIL is invalid");

const db = await getDb();
if (!db) throw new Error("DATABASE_UNAVAILABLE");
const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
if (existing) throw new Error(`An account with this email already exists (id ${existing.id}, role ${existing.role}); refusing to elevate it automatically`);

const now = new Date();
const result = await db.insert(users).values({
  openId: `owner_${randomBytes(18).toString("hex")}`,
  name,
  email,
  passwordHash: hashPassword(password),
  emailVerifiedAt: now,
  termsAcceptedAt: now,
  privacyAcceptedAt: now,
  loginMethod: "owner_email",
  role: "super_admin",
  authVersion: 1,
});
console.log(`Super Admin created. userId=${Number(result[0].insertId)} email=${email}`);

import { desc, eq, sql } from "drizzle-orm";
import { auditLogs, orders, restaurantApplications, restaurants, users } from "../drizzle/schema";
import { getDb } from "./db";

export async function getOwnerOverview() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [[userCount], [restaurantCount], [pendingCount], [orderCount], [turnover]] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(users),
    db.select({ value: sql<number>`count(*)` }).from(restaurants),
    db.select({ value: sql<number>`count(*)` }).from(restaurantApplications).where(eq(restaurantApplications.status, "pending")),
    db.select({ value: sql<number>`count(*)` }).from(orders),
    db.select({ value: sql<number>`coalesce(sum(${orders.totalKopecks}), 0)` }).from(orders),
  ]);
  return { users: Number(userCount.value), restaurants: Number(restaurantCount.value), pendingApplications: Number(pendingCount.value), orders: Number(orderCount.value), turnoverKopecks: Number(turnover.value) };
}

export async function listOwnerUsers() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.createdAt)).limit(200);
}

export async function listOwnerOrders() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select({ id: orders.id, status: orders.status, fulfillment: orders.fulfillment, paymentMethod: orders.paymentMethod, totalKopecks: orders.totalKopecks, address: orders.address, createdAt: orders.createdAt, restaurantName: restaurants.name, customerName: users.name, customerPhone: users.phone }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).innerJoin(users, eq(users.id, orders.customerId)).orderBy(desc(orders.createdAt)).limit(200);
}

export async function listOwnerRestaurants() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select({ id: restaurants.id, name: restaurants.name, type: restaurants.type, address: restaurants.address, phone: restaurants.phone, status: restaurants.status, createdAt: restaurants.createdAt }).from(restaurants).orderBy(desc(restaurants.createdAt));
}

export async function writeAuditLog(input: { actorUserId: number; action: string; entityType: string; entityId?: number; metadata?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.insert(auditLogs).values({ actorUserId: input.actorUserId, action: input.action, entityType: input.entityType, entityId: input.entityId ?? null, metadata: input.metadata ? JSON.stringify(input.metadata) : null });
}

export async function listOwnerAuditLogs() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorName: users.name, actorEmail: users.email }).from(auditLogs).innerJoin(users, eq(users.id, auditLogs.actorUserId)).orderBy(desc(auditLogs.createdAt)).limit(200);
}

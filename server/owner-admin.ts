import { desc, eq, sql } from "drizzle-orm";
import { auditLogs, menuCategories, menuItems, orders, restaurantApplications, restaurants, users } from "../drizzle/schema";
import { getDb } from "./db";

export async function getOwnerOverview() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [[userCount], [newUserCount], [restaurantCount], [approvedRestaurantCount], [blockedRestaurantCount], [pendingCount], [rejectedApplicationCount], [orderCount], [todayOrderCount], [weekOrderCount], [monthOrderCount], [turnover]] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(users),
    db.select({ value: sql<number>`coalesce(sum(case when ${users.createdAt} >= current_timestamp() - interval 30 day then 1 else 0 end), 0)` }).from(users),
    db.select({ value: sql<number>`count(*)` }).from(restaurants),
    db.select({ value: sql<number>`coalesce(sum(case when ${restaurants.status} = 'active' then 1 else 0 end), 0)` }).from(restaurants),
    db.select({ value: sql<number>`coalesce(sum(case when ${restaurants.status} in ('blocked', 'suspended') then 1 else 0 end), 0)` }).from(restaurants),
    db.select({ value: sql<number>`count(*)` }).from(restaurantApplications).where(eq(restaurantApplications.status, "pending")),
    db.select({ value: sql<number>`coalesce(sum(case when ${restaurantApplications.status} = 'rejected' then 1 else 0 end), 0)` }).from(restaurantApplications),
    db.select({ value: sql<number>`count(*)` }).from(orders),
    db.select({ value: sql<number>`coalesce(sum(case when ${orders.createdAt} >= current_date() then 1 else 0 end), 0)` }).from(orders),
    db.select({ value: sql<number>`coalesce(sum(case when ${orders.createdAt} >= current_timestamp() - interval 7 day then 1 else 0 end), 0)` }).from(orders),
    db.select({ value: sql<number>`coalesce(sum(case when ${orders.createdAt} >= current_timestamp() - interval 30 day then 1 else 0 end), 0)` }).from(orders),
    db.select({ value: sql<number>`coalesce(sum(${orders.totalKopecks}), 0)` }).from(orders),
  ]);
  return {
    users: Number(userCount.value),
    newUsers30d: Number(newUserCount.value),
    restaurants: Number(restaurantCount.value),
    approvedRestaurants: Number(approvedRestaurantCount.value),
    blockedRestaurants: Number(blockedRestaurantCount.value),
    pendingApplications: Number(pendingCount.value),
    rejectedApplications: Number(rejectedApplicationCount.value),
    orders: Number(orderCount.value),
    ordersToday: Number(todayOrderCount.value),
    ordersThisWeek: Number(weekOrderCount.value),
    ordersThisMonth: Number(monthOrderCount.value),
    turnoverKopecks: Number(turnover.value),
  };
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
  return db.select({ id: restaurants.id, name: restaurants.name, type: restaurants.type, address: restaurants.address, phone: restaurants.phone, description: restaurants.description, status: restaurants.status, createdAt: restaurants.createdAt }).from(restaurants).orderBy(desc(restaurants.createdAt));
}

export async function updateOwnerRestaurant(input: { id: number; name: string; type: string; address: string; phone: string; description?: string; status: "active" | "suspended" | "blocked" }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [existing] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, input.id)).limit(1);
  if (!existing) throw new Error("RESTAURANT_NOT_FOUND");
  await db.update(restaurants).set({ name: input.name.trim(), type: input.type.trim(), address: input.address.trim(), phone: input.phone.trim(), description: input.description?.trim() || null, status: input.status }).where(eq(restaurants.id, input.id));
  return { id: input.id, updated: true };
}

export async function listOwnerCategories(restaurantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const query = db.select({ id: menuCategories.id, restaurantId: menuCategories.restaurantId, restaurantName: restaurants.name, name: menuCategories.name, sortOrder: menuCategories.sortOrder, createdAt: menuCategories.createdAt }).from(menuCategories).innerJoin(restaurants, eq(restaurants.id, menuCategories.restaurantId));
  return restaurantId ? query.where(eq(menuCategories.restaurantId, restaurantId)).orderBy(menuCategories.sortOrder, menuCategories.id) : query.orderBy(desc(menuCategories.createdAt));
}

export async function createOwnerCategory(input: { restaurantId: number; name: string; sortOrder?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [restaurant] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, input.restaurantId)).limit(1);
  if (!restaurant) throw new Error("RESTAURANT_NOT_FOUND");
  const name = input.name.trim();
  if (!name) throw new Error("CATEGORY_NAME_REQUIRED");
  const result = await db.insert(menuCategories).values({ restaurantId: input.restaurantId, name, sortOrder: input.sortOrder ?? 0 });
  return { id: Number(result[0].insertId), restaurantId: input.restaurantId, name };
}

export async function updateOwnerCategory(input: { id: number; name: string; sortOrder?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const name = input.name.trim();
  if (!name) throw new Error("CATEGORY_NAME_REQUIRED");
  const [existing] = await db.select({ id: menuCategories.id }).from(menuCategories).where(eq(menuCategories.id, input.id)).limit(1);
  if (!existing) throw new Error("CATEGORY_NOT_FOUND");
  await db.update(menuCategories).set({ name, sortOrder: input.sortOrder ?? 0 }).where(eq(menuCategories.id, input.id));
  return { id: input.id, updated: true };
}

export async function deleteOwnerCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [existing] = await db.select({ id: menuCategories.id }).from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
  if (!existing) throw new Error("CATEGORY_NOT_FOUND");
  const [item] = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.categoryId, id)).limit(1);
  if (item) throw new Error("CATEGORY_HAS_ITEMS");
  await db.delete(menuCategories).where(eq(menuCategories.id, id));
  return { id, deleted: true };
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

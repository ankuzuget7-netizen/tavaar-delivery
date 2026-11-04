import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertRestaurantApplication,
  InsertUser,
  menuCategories,
  menuItems,
  notifications,
  deliveryDrivers,
  driverLocations,
  orderItems,
  orderDriverAssignments,
  orderStatusHistory,
  orders,
  pushTokens,
  restaurantApplications,
  restaurantHours,
  restaurantMembers,
  restaurants,
  users,
} from "../drizzle/schema";
import { broadcastToUser, sendExpoPushNotifications } from "./_core/realtime";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch {
      console.warn("[Database] Failed to connect");
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user");
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createRestaurantApplication(input: InsertRestaurantApplication, submittedByUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const result = await db.insert(restaurantApplications).values({ ...input, submittedByUserId, status: "pending" });
  const id = Number(result[0].insertId);
  return { id, status: "pending" as const };
}

export async function listRestaurantApplications() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select().from(restaurantApplications).orderBy(desc(restaurantApplications.createdAt));
}

export async function updateRestaurantApplicationStatus(
  id: number,
  status: "rejected" | "suspended" | "pending",
) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.update(restaurantApplications).set({ status }).where(eq(restaurantApplications.id, id));
  return { id, status };
}

export async function approveRestaurantApplication(input: { applicationId: number; ownerUserId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(restaurantApplications)
      .where(eq(restaurantApplications.id, input.applicationId))
      .limit(1);
    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    const ownerUserId = application.submittedByUserId ?? input.ownerUserId;
    if (!ownerUserId) throw new Error("OWNER_REQUIRED");
    const [owner] = await tx.select().from(users).where(eq(users.id, ownerUserId)).limit(1);
    if (!owner) throw new Error("OWNER_NOT_FOUND");

    const [existingRestaurant] = await tx
      .select()
      .from(restaurants)
      .where(eq(restaurants.applicationId, application.id))
      .limit(1);

    if (application.status === "approved" && existingRestaurant) {
      const [existingOwnerMembership] = await tx
        .select()
        .from(restaurantMembers)
        .where(and(
          eq(restaurantMembers.restaurantId, existingRestaurant.id),
          eq(restaurantMembers.userId, owner.id),
          eq(restaurantMembers.role, "owner"),
        ))
        .limit(1);
      if (existingOwnerMembership) {
        return { applicationId: application.id, restaurantId: existingRestaurant.id, ownerUserId: owner.id, status: "approved" as const };
      }
      throw new Error("APPLICATION_ALREADY_APPROVED");
    }
    if (application.status !== "pending") throw new Error("APPLICATION_NOT_PENDING");

    let restaurantId: number;
    if (existingRestaurant) {
      restaurantId = existingRestaurant.id;
    } else {
      const result = await tx.insert(restaurants).values({
        applicationId: application.id,
        name: application.name,
        type: application.type,
        address: application.address,
        phone: application.phone,
        description: application.description,
        status: "active",
      });
      restaurantId = Number(result[0].insertId);
    }

    await tx.insert(restaurantMembers).values({ restaurantId, userId: owner.id, role: "owner" }).onDuplicateKeyUpdate({
      set: { role: "owner" },
    });
    await tx.update(restaurantApplications).set({ status: "approved" }).where(eq(restaurantApplications.id, application.id));

    return { applicationId: application.id, restaurantId, ownerUserId: owner.id, status: "approved" as const };
  });
}

export async function listPublicRestaurants() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select().from(restaurants).where(eq(restaurants.status, "active"));
}

async function getOwnedRestaurantId(db: Awaited<ReturnType<typeof getDb>>, userId: number) {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [membership] = await db
    .select({ restaurantId: restaurantMembers.restaurantId })
    .from(restaurantMembers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId))
    .where(and(
      eq(restaurantMembers.userId, userId),
      eq(restaurantMembers.role, "owner"),
      eq(restaurants.status, "active"),
    ))
    .limit(1);
  if (!membership) throw new Error("OWNER_RESTAURANT_NOT_FOUND");
  return membership.restaurantId;
}

export async function getRestaurantOwnerDashboard(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [[restaurant], categories, items, hours] = await Promise.all([
    db!.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1),
    db!.select().from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId)).orderBy(menuCategories.sortOrder, menuCategories.id),
    db!.select().from(menuItems).where(eq(menuItems.restaurantId, restaurantId)).orderBy(menuItems.id),
    db!.select().from(restaurantHours).where(eq(restaurantHours.restaurantId, restaurantId)).orderBy(restaurantHours.dayOfWeek),
  ]);
  return { restaurant, categories, items, hours };
}

export async function createOwnerMenuCategory(userId: number, name: string) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.insert(menuCategories).values({ restaurantId, name: name.trim() });
  return { id: Number(result[0].insertId), restaurantId, name: name.trim() };
}

export async function createOwnerMenuItem(userId: number, input: {
  categoryId: number;
  name: string;
  description?: string;
  priceKopecks: number;
  prepMinutes: number;
}) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [category] = await db!.select().from(menuCategories).where(and(
    eq(menuCategories.id, input.categoryId),
    eq(menuCategories.restaurantId, restaurantId),
  )).limit(1);
  if (!category) throw new Error("MENU_CATEGORY_NOT_FOUND");
  const result = await db!.insert(menuItems).values({ restaurantId, ...input, name: input.name.trim(), description: input.description?.trim() || null });
  return { id: Number(result[0].insertId), restaurantId };
}

export async function setOwnerMenuItemAvailability(userId: number, itemId: number, available: boolean) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  await db!.update(menuItems).set({ available: available ? 1 : 0 }).where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
  return { itemId, available };
}

export async function upsertOwnerHours(userId: number, input: { dayOfWeek: number; startTime: string; endTime: string; isClosed: boolean }) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  await db!.insert(restaurantHours).values({ restaurantId, dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime, isClosed: input.isClosed ? 1 : 0 }).onDuplicateKeyUpdate({
    set: { startTime: input.startTime, endTime: input.endTime, isClosed: input.isClosed ? 1 : 0 },
  });
  return { restaurantId, ...input };
}

export async function getPublicRestaurantMenu(restaurantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [restaurant] = await db.select().from(restaurants).where(and(eq(restaurants.id, restaurantId), eq(restaurants.status, "active"))).limit(1);
  if (!restaurant) throw new Error("RESTAURANT_NOT_FOUND");
  const [categories, items] = await Promise.all([
    db.select().from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId)).orderBy(menuCategories.sortOrder, menuCategories.id),
    db.select().from(menuItems).where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.available, 1))).orderBy(menuItems.id),
  ]);
  return { restaurant, categories, items };
}

export async function createCustomerOrder(userId: number, input: {
  restaurantId: number;
  items: { menuItemId: number; quantity: number }[];
  fulfillment: "delivery" | "pickup";
  idempotencyKey: string;
  address: string;
  customerComment?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: orders.id, customerId: orders.customerId, totalKopecks: orders.totalKopecks, status: orders.status }).from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.customerId !== userId) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
      return { orderId: existing.id, totalKopecks: existing.totalKopecks, status: existing.status, ownerUserIds: [] as number[], ownerTokens: [] as string[], replayed: true };
    }
    const [restaurant] = await tx.select().from(restaurants).where(and(eq(restaurants.id, input.restaurantId), eq(restaurants.status, "active"))).limit(1);
    if (!restaurant) throw new Error("RESTAURANT_NOT_FOUND");
    const itemIds = [...new Set(input.items.map((item) => item.menuItemId))];
    const menu = await tx.select().from(menuItems).where(and(eq(menuItems.restaurantId, input.restaurantId), eq(menuItems.available, 1), inArray(menuItems.id, itemIds)));
    if (menu.length !== itemIds.length) throw new Error("MENU_ITEMS_UNAVAILABLE");
    const menuById = new Map(menu.map((item) => [item.id, item]));
    const lines = input.items.map((line) => {
      const item = menuById.get(line.menuItemId);
      if (!item || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new Error("INVALID_ORDER_ITEMS");
      return { menuItemId: item.id, nameSnapshot: item.name, priceKopecks: item.priceKopecks, quantity: line.quantity, lineTotalKopecks: item.priceKopecks * line.quantity };
    });
    const totalKopecks = lines.reduce((sum, line) => sum + line.lineTotalKopecks, 0);
    const orderResult = await tx.insert(orders).values({ customerId: userId, restaurantId: input.restaurantId, fulfillment: input.fulfillment, idempotencyKey: input.idempotencyKey, address: input.address.trim(), customerComment: input.customerComment?.trim() || null, deliveryFeeKopecks: 0, totalKopecks, status: "placed" });
    const orderId = Number(orderResult[0].insertId);
    await tx.insert(orderItems).values(lines.map((line) => ({ orderId, ...line })));
    await tx.insert(orderStatusHistory).values({ orderId, status: "placed", changedByUserId: userId, reason: "Заказ оформлен клиентом" });
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, input.restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    if (owners.length > 0) await tx.insert(notifications).values(owners.map((owner) => ({ userId: owner.userId, restaurantId: input.restaurantId, orderId, type: "new_order" as const, title: "Новый заказ", body: `Заказ #${orderId} на ${(totalKopecks / 100).toFixed(2)} ₽ ожидает подтверждения.` })));
    const ownerTokens = owners.length ? await tx.select({ token: pushTokens.token }).from(pushTokens).where(and(inArray(pushTokens.userId, owners.map((owner) => owner.userId)), eq(pushTokens.active, 1))) : [];
    return { orderId, totalKopecks, status: "placed" as const, ownerUserIds: owners.map((owner) => owner.userId), ownerTokens: ownerTokens.map((item) => item.token), replayed: false };
  });
  if (result.replayed) return { orderId: result.orderId, totalKopecks: result.totalKopecks, status: result.status, replayed: true };
  for (const ownerUserId of result.ownerUserIds) broadcastToUser(ownerUserId, { type: "order.created", orderId: result.orderId, status: result.status });
  void sendExpoPushNotifications(result.ownerTokens, { title: "Новый заказ", body: `Заказ #${result.orderId} ожидает подтверждения.`, data: { orderId: result.orderId, type: "new_order" } });
  return { orderId: result.orderId, totalKopecks: result.totalKopecks, status: result.status, replayed: false };
}

export async function listCustomerOrders(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select({ id: orders.id, status: orders.status, fulfillment: orders.fulfillment, address: orders.address, totalKopecks: orders.totalKopecks, createdAt: orders.createdAt, restaurantName: restaurants.name }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(eq(orders.customerId, userId)).orderBy(desc(orders.createdAt));
}

export async function listOwnerOrders(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const ownerOrders = await db!.select().from(orders).where(eq(orders.restaurantId, restaurantId)).orderBy(desc(orders.createdAt));
  const items = ownerOrders.length ? await db!.select().from(orderItems).where(inArray(orderItems.orderId, ownerOrders.map((order) => order.id))) : [];
  return ownerOrders.map((order) => ({ ...order, items: items.filter((item) => item.orderId === order.id) }));
}

const ownerOrderTransitions: Record<string, string[]> = {
  placed: ["restaurant_confirmed", "restaurant_rejected"],
  restaurant_confirmed: ["preparing", "restaurant_rejected"],
  preparing: ["ready"],
  ready: ["courier_assigned", "completed"],
  courier_assigned: ["handed_to_courier"],
  handed_to_courier: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["completed"],
};
const orderStatusTitles: Record<string, string> = {
  placed: "оформлен",
  restaurant_confirmed: "принят рестораном",
  preparing: "готовится",
  ready: "готов",
  courier_assigned: "курьер назначен",
  handed_to_courier: "передан курьеру",
  in_transit: "в пути",
  delivered: "доставлен",
  completed: "завершён",
  restaurant_rejected: "отклонён рестораном",
};

export async function updateOwnerOrderStatus(userId: number, orderId: number, status: string, reason?: string) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!ownerOrderTransitions[order.status]?.includes(status)) throw new Error("INVALID_ORDER_TRANSITION");
    await tx.update(orders).set({ status: status as typeof order.status, restaurantComment: reason?.trim() || null }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, status: status as typeof order.status, changedByUserId: userId, reason: reason?.trim() || null });
    await tx.insert(notifications).values({ userId: order.customerId, restaurantId, orderId, type: "order_status", title: "Статус заказа изменён", body: `Заказ #${orderId}: ${orderStatusTitles[status] ?? status}.` });
    const customerTokens = await tx.select({ token: pushTokens.token }).from(pushTokens).where(and(eq(pushTokens.userId, order.customerId), eq(pushTokens.active, 1)));
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    return { orderId, status, customerId: order.customerId, customerTokens: customerTokens.map((item) => item.token), ownerUserIds: owners.map((owner) => owner.userId) };
  });
  broadcastToUser(result.customerId, { type: "order.status_changed", orderId: result.orderId, status: result.status });
  for (const ownerUserId of result.ownerUserIds) broadcastToUser(ownerUserId, { type: "order.status_changed", orderId: result.orderId, status: result.status });
  void sendExpoPushNotifications(result.customerTokens, { title: "Статус заказа изменён", body: `Заказ #${result.orderId}: ${orderStatusTitles[result.status] ?? result.status}.`, data: { orderId: result.orderId, status: result.status, type: "order_status" } });
  return { orderId: result.orderId, status: result.status };
}

export async function listOwnerNotifications(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  return db!.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.restaurantId, restaurantId))).orderBy(desc(notifications.createdAt)).limit(100);
}

export async function markOwnerNotificationRead(userId: number, notificationId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  await db!.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId), eq(notifications.restaurantId, restaurantId)));
  return { notificationId, read: true };
}

export async function registerPushToken(userId: number, token: string, platform: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.insert(pushTokens).values({ userId, token, platform, active: 1, lastSeenAt: new Date() }).onDuplicateKeyUpdate({ set: { userId, platform, active: 1, lastSeenAt: new Date() } });
  return { registered: true };
}

export async function deactivatePushToken(userId: number, token: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.update(pushTokens).set({ active: 0, lastSeenAt: new Date() }).where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));
  return { deactivated: true };
}

export async function registerDeliveryDriver(userId: number, input: { displayName: string; phone: string; vehicle?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.insert(deliveryDrivers).values({ userId, displayName: input.displayName.trim(), phone: input.phone.trim(), vehicle: input.vehicle?.trim() || null, status: "available" }).onDuplicateKeyUpdate({ set: { displayName: input.displayName.trim(), phone: input.phone.trim(), vehicle: input.vehicle?.trim() || null, status: "available", updatedAt: new Date() } });
  const [driver] = await db.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
  return driver;
}

export async function getDriverProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [driver] = await db.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
  if (!driver) throw new Error("DRIVER_NOT_FOUND");
  return driver;
}

export async function listOwnerDrivers(userId: number) {
  const db = await getDb();
  await getOwnedRestaurantId(db, userId);
  return db!.select().from(deliveryDrivers).where(eq(deliveryDrivers.status, "available")).orderBy(deliveryDrivers.displayName);
}

export async function assignDriverToOrder(userId: number, orderId: number, driverId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status !== "ready") throw new Error("ORDER_NOT_READY");
    const [driver] = await tx.select().from(deliveryDrivers).where(and(eq(deliveryDrivers.id, driverId), eq(deliveryDrivers.status, "available"))).limit(1);
    if (!driver) throw new Error("DRIVER_NOT_AVAILABLE");
    const [existing] = await tx.select().from(orderDriverAssignments).where(eq(orderDriverAssignments.orderId, orderId)).limit(1);
    if (existing && existing.status !== "cancelled") throw new Error("DRIVER_ALREADY_ASSIGNED");
    if (existing?.status === "cancelled") await tx.update(orderDriverAssignments).set({ driverId, assignedByUserId: userId, status: "assigned", assignedAt: new Date() }).where(eq(orderDriverAssignments.id, existing.id));
    else await tx.insert(orderDriverAssignments).values({ orderId, driverId, assignedByUserId: userId, status: "assigned" });
    await tx.update(deliveryDrivers).set({ status: "busy" }).where(eq(deliveryDrivers.id, driverId));
    await tx.update(orders).set({ status: "courier_assigned" }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, status: "courier_assigned", changedByUserId: userId, reason: `Назначен курьер: ${driver.displayName}` });
    const customerBody = `К заказу #${orderId} назначен курьер ${driver.displayName}.`;
    await tx.insert(notifications).values([{ userId: order.customerId, restaurantId, orderId, type: "order_status", title: "Курьер назначен", body: customerBody }, { userId: driver.userId, restaurantId, orderId, type: "order_status", title: "Новый заказ для доставки", body: `Вам назначен заказ #${orderId}.` }]);
    const tokens = await tx.select({ token: pushTokens.token, userId: pushTokens.userId }).from(pushTokens).where(and(inArray(pushTokens.userId, [order.customerId, driver.userId]), eq(pushTokens.active, 1)));
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    return { orderId, customerId: order.customerId, driverUserId: driver.userId, ownerUserIds: owners.map((owner) => owner.userId), tokens: tokens.map((token) => token.token), driverName: driver.displayName };
  });
  broadcastToUser(result.customerId, { type: "order.status_changed", orderId, status: "courier_assigned" });
  broadcastToUser(result.driverUserId, { type: "driver.assignment_created", orderId, status: "courier_assigned" });
  for (const ownerUserId of result.ownerUserIds) broadcastToUser(ownerUserId, { type: "order.status_changed", orderId, status: "courier_assigned" });
  void sendExpoPushNotifications(result.tokens, { title: "Курьер назначен", body: `Заказ #${orderId}: курьер ${result.driverName} уже назначен.`, data: { orderId, type: "driver_assignment" } });
  return { orderId, status: "courier_assigned" as const, driverName: result.driverName };
}

export async function listDriverAssignments(userId: number) {
  const db = await getDb();
  const [driver] = await db!.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
  if (!driver) throw new Error("DRIVER_NOT_FOUND");
  const assignments = await db!.select({ assignment: orderDriverAssignments, order: orders, restaurant: restaurants }).from(orderDriverAssignments).innerJoin(orders, eq(orders.id, orderDriverAssignments.orderId)).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(and(eq(orderDriverAssignments.driverId, driver.id), inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"]))).orderBy(desc(orderDriverAssignments.updatedAt));
  return { driver, assignments };
}

export async function updateDriverAssignmentStatus(userId: number, orderId: number, status: "accepted" | "picked_up" | "delivered") {
  const db = await getDb();
  const result = await db!.transaction(async (tx) => {
    const [driver] = await tx.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
    if (!driver) throw new Error("DRIVER_NOT_FOUND");
    const [assignment] = await tx.select().from(orderDriverAssignments).where(and(eq(orderDriverAssignments.orderId, orderId), eq(orderDriverAssignments.driverId, driver.id))).limit(1);
    if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");
    const allowed: Record<string, string[]> = { assigned: ["accepted"], accepted: ["picked_up"], picked_up: ["delivered"] };
    if (!allowed[assignment.status]?.includes(status)) throw new Error("INVALID_DRIVER_TRANSITION");
    const nextOrderStatus = status === "picked_up" ? "in_transit" : status === "delivered" ? "delivered" : "courier_assigned";
    await tx.update(orderDriverAssignments).set({ status }).where(eq(orderDriverAssignments.id, assignment.id));
    await tx.update(orders).set({ status: nextOrderStatus }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, status: nextOrderStatus, changedByUserId: userId, reason: `Статус курьера: ${status}` });
    if (status === "delivered") await tx.update(deliveryDrivers).set({ status: "available" }).where(eq(deliveryDrivers.id, driver.id));
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const body = `Заказ #${orderId}: ${orderStatusTitles[nextOrderStatus] ?? nextOrderStatus}.`;
    await tx.insert(notifications).values({ userId: order.customerId, restaurantId: order.restaurantId, orderId, type: "order_status", title: "Статус заказа изменён", body });
    const customerTokens = await tx.select({ token: pushTokens.token }).from(pushTokens).where(and(eq(pushTokens.userId, order.customerId), eq(pushTokens.active, 1)));
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, order.restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    return { orderId, customerId: order.customerId, restaurantId: order.restaurantId, status: nextOrderStatus, customerTokens: customerTokens.map((token) => token.token), ownerUserIds: owners.map((owner) => owner.userId) };
  });
  broadcastToUser(result.customerId, { type: "order.status_changed", orderId, status: result.status });
  for (const ownerUserId of result.ownerUserIds) broadcastToUser(ownerUserId, { type: "order.status_changed", orderId, status: result.status });
  void sendExpoPushNotifications(result.customerTokens, { title: "Статус заказа изменён", body: `Заказ #${orderId}: ${orderStatusTitles[result.status] ?? result.status}.`, data: { orderId, status: result.status, type: "order_status" } });
  return { orderId, status: result.status };
}

export async function updateDriverLocation(userId: number, input: { orderId: number; latitudeE6: number; longitudeE6: number; accuracyCm?: number }) {
  const db = await getDb();
  const [driver] = await db!.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
  if (!driver) throw new Error("DRIVER_NOT_FOUND");
  const [assignment] = await db!.select().from(orderDriverAssignments).where(and(eq(orderDriverAssignments.orderId, input.orderId), eq(orderDriverAssignments.driverId, driver.id), inArray(orderDriverAssignments.status, ["accepted", "picked_up"]))).limit(1);
  if (!assignment) throw new Error("ASSIGNMENT_NOT_ACTIVE");
  const [order] = await db!.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  await db!.insert(driverLocations).values({ orderId: input.orderId, driverId: driver.id, latitudeE6: input.latitudeE6, longitudeE6: input.longitudeE6, accuracyCm: input.accuracyCm ?? null });
  const owners = await db!.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, order.restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
  const event = { type: "driver.location_updated", orderId: input.orderId, latitudeE6: input.latitudeE6, longitudeE6: input.longitudeE6 };
  broadcastToUser(order.customerId, event);
  for (const owner of owners) broadcastToUser(owner.userId, event);
  return { recorded: true, recordedAt: new Date() };
}

export async function getCustomerOrderTracking(userId: number, orderId: number) {
  const db = await getDb();
  const [order] = await db!.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, userId))).limit(1);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const [assignment] = await db!.select({ assignment: orderDriverAssignments, driver: deliveryDrivers }).from(orderDriverAssignments).innerJoin(deliveryDrivers, eq(deliveryDrivers.id, orderDriverAssignments.driverId)).where(eq(orderDriverAssignments.orderId, orderId)).limit(1);
  const [location] = assignment ? await db!.select().from(driverLocations).where(and(eq(driverLocations.orderId, orderId), eq(driverLocations.driverId, assignment.driver.id))).orderBy(desc(driverLocations.recordedAt)).limit(1) : [];
  return { order, assignment: assignment ?? null, location: location ?? null };
}

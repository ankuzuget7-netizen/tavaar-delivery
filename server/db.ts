import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertRestaurantApplication,
  InsertUser,
  menuCategories,
  menuItems,
  menuDiscounts,
  promoCodes,
  promoCodeUsages,
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
import { storagePut } from "./storage";
import { RESTAURANT_OPERATOR_ROLES } from "./membership-policy";
import { assertTeamRoleAvailable, normalizeTeamPhone } from "./team-policy";

const NEW_ORDER_NOTIFICATION_TITLE = "Новый заказ";

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

export async function getUserAccessProfile(userId: number) {
  const db = await getDb();
  if (!db) return { isRestaurantOwner: false, restaurantIds: [] as number[], isDriver: false };

  const memberships = await db
    .select({ restaurantId: restaurantMembers.restaurantId })
    .from(restaurantMembers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId))
    .where(and(
      eq(restaurantMembers.userId, userId),
      inArray(restaurantMembers.role, RESTAURANT_OPERATOR_ROLES),
      eq(restaurants.status, "active"),
    ));
  const [driver] = await db
    .select({ id: deliveryDrivers.id })
    .from(deliveryDrivers)
    .where(eq(deliveryDrivers.userId, userId))
    .limit(1);

  return {
    isRestaurantOwner: memberships.length > 0,
    restaurantIds: memberships.map((item) => item.restaurantId),
    isDriver: Boolean(driver),
  };
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

/** Reads a city only when it is explicitly the first part of the stored address. */
export function cityFromAddress(address: string | null | undefined): string | null {
  const first = (address ?? "").split(",")[0]?.trim().replace(/^г\.?\s*/i, "").replace(/^город\s+/i, "").trim();
  if (!first || /^(ул\.?|улица|проспект|пр-т|пер\.?|переулок|д\.?|дом)(?:\s|$)/i.test(first)) return null;
  return first;
}

export async function listPublicRestaurants(city?: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const rows = await db.select().from(restaurants).where(eq(restaurants.status, "active"));
  const normalizedCity = cityFromAddress(city);
  const selectedRows = normalizedCity ? rows.filter((row) => cityFromAddress(row.address) === normalizedCity) : rows;
  if (selectedRows.length === 0) return [];
  const hours = await db.select().from(restaurantHours).where(inArray(restaurantHours.restaurantId, selectedRows.map((row) => row.id)));
  const hoursByRestaurant = new Map<number, typeof hours>();
  for (const hour of hours) {
    const current = hoursByRestaurant.get(hour.restaurantId) ?? [];
    current.push(hour);
    hoursByRestaurant.set(hour.restaurantId, current);
  }
  return selectedRows.map((restaurant) => ({ ...restaurant, city: cityFromAddress(restaurant.address), openStatus: getRestaurantOpenStatus(hoursByRestaurant.get(restaurant.id) ?? []) }));
}

export async function listPublicCities() {
  const restaurants = await listPublicRestaurants();
  return Array.from(new Set(restaurants.map((restaurant) => restaurant.city).filter((city): city is string => Boolean(city)))).sort((a, b) => a.localeCompare(b, "ru"));
}

export async function searchPublicCatalog(query: string, city?: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const normalized = query.trim();
  if (!normalized) return { restaurants: await listPublicRestaurants(city), dishes: [] };
  const pattern = `%${normalized}%`;
  const [publicRestaurants, dishes] = await Promise.all([
    db.select().from(restaurants).where(and(eq(restaurants.status, "active"), or(like(restaurants.name, pattern), like(restaurants.type, pattern), like(restaurants.address, pattern)))).limit(50),
    db.select({ id: menuItems.id, restaurantId: menuItems.restaurantId, restaurantName: restaurants.name, name: menuItems.name, description: menuItems.description, priceKopecks: menuItems.priceKopecks, prepMinutes: menuItems.prepMinutes })
      .from(menuItems)
      .innerJoin(restaurants, eq(restaurants.id, menuItems.restaurantId))
      .where(and(eq(restaurants.status, "active"), eq(menuItems.available, 1), or(like(menuItems.name, pattern), like(menuItems.description, pattern)))).limit(100),
  ]);
  const cityRestaurants = city ? new Set((await listPublicRestaurants(city)).map((restaurant) => restaurant.id)) : null;
  return {
    restaurants: publicRestaurants.filter((restaurant) => !cityRestaurants || cityRestaurants.has(restaurant.id)).map((restaurant) => ({ ...restaurant, city: cityFromAddress(restaurant.address) })),
    dishes: dishes.filter((dish) => !cityRestaurants || cityRestaurants.has(dish.restaurantId)),
  };
}

async function getOwnedRestaurantId(db: Awaited<ReturnType<typeof getDb>>, userId: number) {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [membership] = await db
    .select({ restaurantId: restaurantMembers.restaurantId })
    .from(restaurantMembers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId))
    .where(and(
      eq(restaurantMembers.userId, userId),
      inArray(restaurantMembers.role, RESTAURANT_OPERATOR_ROLES),
      eq(restaurants.status, "active"),
    ))
    .limit(1);
  if (!membership) throw new Error("OWNER_RESTAURANT_NOT_FOUND");
  return membership.restaurantId;
}

async function requireRestaurantOwner(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, restaurantId: number) {
  const [membership] = await db.select({ role: restaurantMembers.role }).from(restaurantMembers).where(and(
    eq(restaurantMembers.restaurantId, restaurantId),
    eq(restaurantMembers.userId, userId),
    eq(restaurantMembers.role, "owner"),
  )).limit(1);
  if (!membership) throw new Error("RESTAURANT_OWNER_REQUIRED");
}

export async function listOwnerTeam(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [actorMembership] = await db!.select({ role: restaurantMembers.role }).from(restaurantMembers).where(and(
    eq(restaurantMembers.restaurantId, restaurantId),
    eq(restaurantMembers.userId, userId),
  )).limit(1);
  const memberships = await db!.select({
    membershipId: restaurantMembers.id,
    userId: users.id,
    name: users.name,
    phone: users.phone,
    role: restaurantMembers.role,
    createdAt: restaurantMembers.createdAt,
  }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(and(
    eq(restaurantMembers.restaurantId, restaurantId),
    inArray(restaurantMembers.role, ["manager", "staff"]),
  )).orderBy(users.name);
  const couriers = await listOwnerCouriers(userId);
  return {
    canManage: actorMembership?.role === "owner",
    administrators: memberships.filter((item) => item.role === "manager"),
    couriers,
  };
}

export async function addOwnerAdministrator(userId: number, phone: string) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const normalizedPhone = normalizeTeamPhone(phone);
  return db!.transaction(async (tx) => {
    await requireRestaurantOwner(tx as unknown as NonNullable<Awaited<ReturnType<typeof getDb>>>, userId, restaurantId);
    const [account] = await tx.select({ id: users.id, role: users.role, phoneVerifiedAt: users.phoneVerifiedAt })
      .from(users).where(eq(users.phone, normalizedPhone)).limit(1);
    if (!account) throw new Error("TEAM_USER_NOT_FOUND");
    if (!account.phoneVerifiedAt) throw new Error("TEAM_PHONE_NOT_VERIFIED");
    if (account.role !== "user") throw new Error("TEAM_ACCOUNT_ROLE_PROTECTED");
    const memberships = await tx.select({ role: restaurantMembers.role }).from(restaurantMembers).where(and(
      eq(restaurantMembers.restaurantId, restaurantId),
      eq(restaurantMembers.userId, account.id),
    ));
    assertTeamRoleAvailable(memberships.map((item) => item.role), "manager");
    await tx.insert(restaurantMembers).values({ restaurantId, userId: account.id, role: "manager" });
    return { userId: account.id, restaurantId, role: "manager" as const };
  });
}

export async function deleteOwnerAdministrator(userId: number, targetUserId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  return db!.transaction(async (tx) => {
    await requireRestaurantOwner(tx as unknown as NonNullable<Awaited<ReturnType<typeof getDb>>>, userId, restaurantId);
    const result = await tx.delete(restaurantMembers).where(and(
      eq(restaurantMembers.restaurantId, restaurantId),
      eq(restaurantMembers.userId, targetUserId),
      eq(restaurantMembers.role, "manager"),
    ));
    if (!result[0].affectedRows) throw new Error("TEAM_ADMIN_NOT_FOUND");
    return { userId: targetUserId, deleted: true };
  });
}

export async function getRestaurantOwnerDashboard(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [[legacyRestaurant], categories, legacyItems] = await Promise.all([
    db!.select({
      id: restaurants.id,
      applicationId: restaurants.applicationId,
      name: restaurants.name,
      type: restaurants.type,
      address: restaurants.address,
      phone: restaurants.phone,
      description: restaurants.description,
      deliveryConditions: restaurants.deliveryConditions,
      deliveryFeeKopecks: restaurants.deliveryFeeKopecks,
      freeDeliveryThresholdKopecks: restaurants.freeDeliveryThresholdKopecks,
      status: restaurants.status,
      createdAt: restaurants.createdAt,
      updatedAt: restaurants.updatedAt,
    }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1),
    db!.select().from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId)).orderBy(menuCategories.sortOrder, menuCategories.id),
    db!.select({
      id: menuItems.id,
      restaurantId: menuItems.restaurantId,
      categoryId: menuItems.categoryId,
      name: menuItems.name,
      description: menuItems.description,
      priceKopecks: menuItems.priceKopecks,
      prepMinutes: menuItems.prepMinutes,
      available: menuItems.available,
      createdAt: menuItems.createdAt,
      updatedAt: menuItems.updatedAt,
    }).from(menuItems).where(eq(menuItems.restaurantId, restaurantId)).orderBy(menuItems.id),
  ]);
  const restaurant = legacyRestaurant ? { ...legacyRestaurant, logoUrl: null as string | null, coverUrl: null as string | null } : undefined;
  const items = legacyItems.map((item) => ({ ...item, imageUrl: null as string | null, portionLabel: null as string | null }));
  const [discounts, promoCodesList] = await Promise.all([db!.select().from(menuDiscounts).where(eq(menuDiscounts.restaurantId, restaurantId)), db!.select().from(promoCodes).where(eq(promoCodes.restaurantId, restaurantId)).orderBy(desc(promoCodes.createdAt))]);
  let hours: typeof restaurantHours.$inferSelect[] = [];
  try {
    hours = await db!.select().from(restaurantHours).where(eq(restaurantHours.restaurantId, restaurantId)).orderBy(restaurantHours.dayOfWeek);
  } catch (error) {
    console.error("[OwnerDashboard] Failed to load restaurant hours; returning empty schedule", error);
  }
  return { restaurant, categories, items, hours, discounts, promoCodes: promoCodesList };
}

export async function createOwnerMenuCategory(userId: number, name: string) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.insert(menuCategories).values({ restaurantId, name: name.trim() });
  return { id: Number(result[0].insertId), restaurantId, name: name.trim() };
}

export async function updateOwnerMenuCategory(userId: number, categoryId: number, name: string) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.update(menuCategories).set({ name: name.trim() }).where(and(eq(menuCategories.id, categoryId), eq(menuCategories.restaurantId, restaurantId)));
  if (!result[0].affectedRows) throw new Error("MENU_CATEGORY_NOT_FOUND");
  return { id: categoryId, restaurantId, name: name.trim() };
}

export async function deleteOwnerMenuCategory(userId: number, categoryId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const items = await db!.select({ id: menuItems.id }).from(menuItems).where(and(eq(menuItems.categoryId, categoryId), eq(menuItems.restaurantId, restaurantId))).limit(1);
  if (items.length) throw new Error("MENU_CATEGORY_NOT_EMPTY");
  const result = await db!.delete(menuCategories).where(and(eq(menuCategories.id, categoryId), eq(menuCategories.restaurantId, restaurantId)));
  if (!result[0].affectedRows) throw new Error("MENU_CATEGORY_NOT_FOUND");
  return { id: categoryId, deleted: true };
}

export async function createOwnerMenuItem(userId: number, input: {
  categoryId: number;
  name: string;
  description?: string;
  priceKopecks: number;
  portionLabel?: string;
  prepMinutes: number;
  imageUrl?: string;
}) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [category] = await db!.select().from(menuCategories).where(and(
    eq(menuCategories.id, input.categoryId),
    eq(menuCategories.restaurantId, restaurantId),
  )).limit(1);
  if (!category) throw new Error("MENU_CATEGORY_NOT_FOUND");
  const result = await db!.insert(menuItems).values({ restaurantId, ...input, name: input.name.trim(), description: input.description?.trim() || null, portionLabel: input.portionLabel?.trim() || null });
  return { id: Number(result[0].insertId), restaurantId };
}

export async function setOwnerMenuItemAvailability(userId: number, itemId: number, available: boolean) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  await db!.update(menuItems).set({ available: available ? 1 : 0 }).where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
  return { itemId, available };
}

export async function updateOwnerMenuItem(userId: number, itemId: number, input: { categoryId: number; name: string; description?: string; priceKopecks: number; portionLabel?: string; prepMinutes: number }) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [category] = await db!.select({ id: menuCategories.id }).from(menuCategories).where(and(eq(menuCategories.id, input.categoryId), eq(menuCategories.restaurantId, restaurantId))).limit(1);
  if (!category) throw new Error("MENU_CATEGORY_NOT_FOUND");
  const result = await db!.update(menuItems).set({ categoryId: input.categoryId, name: input.name.trim(), description: input.description?.trim() || null, priceKopecks: input.priceKopecks, portionLabel: input.portionLabel?.trim() || null, prepMinutes: input.prepMinutes }).where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
  if (!result[0].affectedRows) throw new Error("MENU_ITEM_NOT_FOUND");
  return { id: itemId, restaurantId };
}

export async function deleteOwnerMenuItem(userId: number, itemId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.delete(menuItems).where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
  if (!result[0].affectedRows) throw new Error("MENU_ITEM_NOT_FOUND");
  return { id: itemId, deleted: true };
}

export async function getRestaurantOwnerSummary(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const ownerOrders = await db!.select({ id: orders.id, status: orders.status, totalKopecks: orders.totalKopecks, createdAt: orders.createdAt }).from(orders).where(eq(orders.restaurantId, restaurantId)).orderBy(desc(orders.createdAt));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Krasnoyarsk", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = day.format(new Date());
  const todayOrders = ownerOrders.filter((order) => day.format(new Date(order.createdAt)) === today);
  const completedStatuses = new Set(["delivered", "completed"]);
  const completed = ownerOrders.filter((order) => completedStatuses.has(order.status));
  return { totalOrders: ownerOrders.length, todayOrders: todayOrders.length, newOrders: ownerOrders.filter((order) => order.status === "placed").length, completedOrders: completed.length, todayRevenueKopecks: todayOrders.filter((order) => completedStatuses.has(order.status)).reduce((sum, order) => sum + order.totalKopecks, 0), totalRevenueKopecks: completed.reduce((sum, order) => sum + order.totalKopecks, 0) };
}

export async function upsertOwnerHours(userId: number, input: { dayOfWeek: number; startTime: string; endTime: string; isClosed: boolean }) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  await db!.insert(restaurantHours).values({ restaurantId, dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime, isClosed: input.isClosed ? 1 : 0 }).onDuplicateKeyUpdate({
    set: { startTime: input.startTime, endTime: input.endTime, isClosed: input.isClosed ? 1 : 0 },
  });
  return { restaurantId, ...input };
}


export async function listOwnerPromotions(userId: number) { const db = await getDb(); const restaurantId = await getOwnedRestaurantId(db, userId); const [discounts, promoCodesList] = await Promise.all([db!.select().from(menuDiscounts).where(eq(menuDiscounts.restaurantId, restaurantId)).orderBy(desc(menuDiscounts.createdAt)), db!.select().from(promoCodes).where(eq(promoCodes.restaurantId, restaurantId)).orderBy(desc(promoCodes.createdAt))]); return { discounts, promoCodes: promoCodesList }; }
export async function saveOwnerDiscount(userId: number, input: { id?: number; menuItemId?: number; categoryId?: number; discountType: "percent" | "fixed"; value: number; startsAt?: string; endsAt?: string; isActive: boolean }) { const db = await getDb(); const restaurantId = await getOwnedRestaurantId(db, userId); if (!input.menuItemId && !input.categoryId) throw new Error("DISCOUNT_TARGET_REQUIRED"); if (input.discountType === "percent" && (input.value < 1 || input.value > 100)) throw new Error("INVALID_DISCOUNT"); if (input.discountType === "fixed" && input.value < 1) throw new Error("INVALID_DISCOUNT"); const values = { restaurantId, menuItemId: input.menuItemId ?? null, categoryId: input.categoryId ?? null, discountType: input.discountType, value: input.value, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, isActive: input.isActive ? 1 : 0 }; if (input.id) { const result = await db!.update(menuDiscounts).set(values).where(and(eq(menuDiscounts.id, input.id), eq(menuDiscounts.restaurantId, restaurantId))); if (!result[0].affectedRows) throw new Error("DISCOUNT_NOT_FOUND"); return { id: input.id }; } const result = await db!.insert(menuDiscounts).values(values); return { id: Number(result[0].insertId) }; }
export async function deleteOwnerDiscount(userId: number, id: number) { const db = await getDb(); const restaurantId = await getOwnedRestaurantId(db, userId); const result = await db!.delete(menuDiscounts).where(and(eq(menuDiscounts.id, id), eq(menuDiscounts.restaurantId, restaurantId))); if (!result[0].affectedRows) throw new Error("DISCOUNT_NOT_FOUND"); return { id, deleted: true }; }
export async function saveOwnerPromoCode(userId: number, input: { id?: number; code: string; discountType: "percent" | "fixed"; value: number; minOrderKopecks: number; usageLimit?: number; usagePerUserLimit?: number; startsAt?: string; endsAt?: string; isActive: boolean }) { const db = await getDb(); const restaurantId = await getOwnedRestaurantId(db, userId); const code = input.code.trim().toUpperCase(); if (!/^[A-ZА-Я0-9_-]{3,64}$/.test(code)) throw new Error("INVALID_PROMO_CODE"); if (input.discountType === "percent" && (input.value < 1 || input.value > 100)) throw new Error("INVALID_DISCOUNT"); if (input.discountType === "fixed" && input.value < 1) throw new Error("INVALID_DISCOUNT"); const values = { restaurantId, code, discountType: input.discountType, value: input.value, minOrderKopecks: input.minOrderKopecks, usageLimit: input.usageLimit ?? null, usagePerUserLimit: input.usagePerUserLimit ?? null, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, isActive: input.isActive ? 1 : 0 }; try { if (input.id) { const result = await db!.update(promoCodes).set(values).where(and(eq(promoCodes.id, input.id), eq(promoCodes.restaurantId, restaurantId))); if (!result[0].affectedRows) throw new Error("PROMO_NOT_FOUND"); return { id: input.id }; } const result = await db!.insert(promoCodes).values(values); return { id: Number(result[0].insertId) }; } catch (error) { if (String(error).includes("Duplicate")) throw new Error("PROMO_DUPLICATE"); throw error; } }
export async function deleteOwnerPromoCode(userId: number, id: number) { const db = await getDb(); const restaurantId = await getOwnedRestaurantId(db, userId); const result = await db!.delete(promoCodes).where(and(eq(promoCodes.id, id), eq(promoCodes.restaurantId, restaurantId))); if (!result[0].affectedRows) throw new Error("PROMO_NOT_FOUND"); return { id, deleted: true }; }
export async function updateOwnerRestaurantProfile(userId: number, input: { name: string; address: string; phone: string; description?: string; deliveryConditions?: string; deliveryFeeKopecks: number; freeDeliveryThresholdKopecks?: number | null }) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  await db!.update(restaurants).set({ name: input.name.trim(), address: input.address.trim(), phone: input.phone.trim(), description: input.description?.trim() || null, deliveryConditions: input.deliveryConditions?.trim() || null, deliveryFeeKopecks: input.deliveryFeeKopecks, freeDeliveryThresholdKopecks: input.freeDeliveryThresholdKopecks ?? null }).where(eq(restaurants.id, restaurantId));
  return { restaurantId };
}

export async function uploadOwnerRestaurantImage(userId: number, input: { kind: "item" | "logo" | "cover"; targetId?: number; data: string; contentType: string }) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const match = input.data.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || match[1] !== input.contentType || !/^image\/(jpeg|png|webp)$/.test(input.contentType)) throw new Error("INVALID_IMAGE");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 6 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
  const extension = input.contentType.split("/")[1].replace("jpeg", "jpg");
  const target = input.kind === "item" ? `menu-items/${restaurantId}/${input.targetId ?? "new"}` : `restaurants/${restaurantId}/${input.kind}`;
  const uploaded = await storagePut(`${target}.${extension}`, buffer, input.contentType);
  if (input.kind === "item") {
    if (!input.targetId) throw new Error("ITEM_REQUIRED");
    await db!.update(menuItems).set({ imageUrl: uploaded.url }).where(and(eq(menuItems.id, input.targetId), eq(menuItems.restaurantId, restaurantId)));
  } else {
    await db!.update(restaurants).set(input.kind === "logo" ? { logoUrl: uploaded.url } : { coverUrl: uploaded.url }).where(eq(restaurants.id, restaurantId));
  }
  return { url: uploaded.url, kind: input.kind, targetId: input.targetId ?? null };
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getRestaurantOpenStatus(hours: Array<{ dayOfWeek: number; startTime: string; endTime: string; isClosed: number }>) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Krasnoyarsk",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday ?? "");
  const currentMinutes = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const today = hours.find((item) => item.dayOfWeek === weekdayIndex);
  const yesterday = hours.find((item) => item.dayOfWeek === (weekdayIndex + 6) % 7);
  const isWithin = (item: typeof today, minutes: number) => {
    if (!item || item.isClosed) return false;
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    return end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  };
  const overnightYesterday = yesterday && yesterday.endTime < yesterday.startTime;
  const isOpen = isWithin(today, currentMinutes) || Boolean(overnightYesterday && currentMinutes < timeToMinutes(yesterday!.endTime));
  return { isOpen, hours };
}


type PricingDiscount = { discountType: "percent" | "fixed"; value: number };
function activeDiscount(discounts: Array<typeof menuDiscounts.$inferSelect>, item: { id: number; categoryId: number }, now = new Date()) {
  const active = discounts.filter((discount) => discount.isActive && (!discount.startsAt || new Date(discount.startsAt) <= now) && (!discount.endsAt || new Date(discount.endsAt) >= now));
  return active.find((discount) => discount.menuItemId === item.id) ?? active.find((discount) => discount.categoryId === item.categoryId) ?? active.find((discount) => !discount.menuItemId && !discount.categoryId);
}
function discountedPrice(originalPriceKopecks: number, discount?: PricingDiscount | null) {
  if (!discount) return { priceKopecks: originalPriceKopecks, discountKopecks: 0, discountPercent: 0 };
  const raw = discount.discountType === "percent" ? Math.round(originalPriceKopecks * Math.max(0, Math.min(100, discount.value)) / 100) : Math.max(0, discount.value);
  const priceKopecks = Math.max(0, originalPriceKopecks - raw);
  return { priceKopecks, discountKopecks: originalPriceKopecks - priceKopecks, discountPercent: originalPriceKopecks ? Math.round((originalPriceKopecks - priceKopecks) * 100 / originalPriceKopecks) : 0 };
}
function calculateDeliveryFee(restaurant: typeof restaurants.$inferSelect, subtotalKopecks: number, fulfillment: "delivery" | "pickup") {
  if (fulfillment === "pickup") return 0;
  if (restaurant.freeDeliveryThresholdKopecks !== null && restaurant.freeDeliveryThresholdKopecks > 0 && subtotalKopecks >= restaurant.freeDeliveryThresholdKopecks) return 0;
  return Math.max(0, restaurant.deliveryFeeKopecks ?? 0);
}
function promoDiscount(subtotalKopecks: number, promo: typeof promoCodes.$inferSelect) {
  if (subtotalKopecks < promo.minOrderKopecks) throw new Error("PROMO_MIN_ORDER_NOT_REACHED");
  return Math.min(subtotalKopecks, promo.discountType === "percent" ? Math.round(subtotalKopecks * Math.max(0, Math.min(100, promo.value)) / 100) : Math.max(0, promo.value));
}
async function priceMenuLines(tx: any, restaurantId: number, requested: { menuItemId: number; quantity: number }[]) {
  const ids = [...new Set(requested.map((item) => item.menuItemId))];
  const menu = await tx.select().from(menuItems).where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.available, 1), inArray(menuItems.id, ids)));
  if (menu.length !== ids.length) throw new Error("MENU_ITEMS_UNAVAILABLE");
  const discounts = await tx.select().from(menuDiscounts).where(eq(menuDiscounts.restaurantId, restaurantId));
  const byId = new Map(menu.map((item: any) => [item.id, item]));
  return requested.map((line) => {
    const item = byId.get(line.menuItemId) as typeof menuItems.$inferSelect | undefined;
    if (!item || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new Error("INVALID_ORDER_ITEMS");
    const pricing = discountedPrice(item.priceKopecks, activeDiscount(discounts, item));
    return { menuItemId: item.id, nameSnapshot: item.name, originalPriceKopecks: item.priceKopecks, priceKopecks: pricing.priceKopecks, discountKopecks: pricing.discountKopecks, quantity: line.quantity, lineTotalKopecks: pricing.priceKopecks * line.quantity };
  });
}
async function resolvePromo(tx: any, restaurantId: number, customerId: number, code: string | undefined, subtotalKopecks: number) {
  if (!code?.trim()) return { promo: null, discountKopecks: 0 };
  const normalized = code.trim().toUpperCase();
  const [promo] = await tx.select().from(promoCodes).where(and(eq(promoCodes.restaurantId, restaurantId), eq(promoCodes.code, normalized), eq(promoCodes.isActive, 1))).limit(1);
  if (!promo) throw new Error("PROMO_NOT_FOUND");
  const now = new Date();
  if ((promo.startsAt && new Date(promo.startsAt) > now) || (promo.endsAt && new Date(promo.endsAt) < now)) throw new Error("PROMO_EXPIRED");
  if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) throw new Error("PROMO_USAGE_LIMIT");
  const usages = await tx.select({ id: promoCodeUsages.id }).from(promoCodeUsages).where(and(eq(promoCodeUsages.promoCodeId, promo.id), eq(promoCodeUsages.customerId, customerId)));
  if (promo.usagePerUserLimit !== null && usages.length >= promo.usagePerUserLimit) throw new Error("PROMO_USER_LIMIT");
  return { promo, discountKopecks: promoDiscount(subtotalKopecks, promo) };
}
export async function previewCustomerOrder(userId: number, input: { restaurantId: number; items: { menuItemId: number; quantity: number }[]; fulfillment: "delivery" | "pickup"; promoCode?: string }) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async (tx) => {
    const [restaurant] = await tx.select().from(restaurants).where(and(eq(restaurants.id, input.restaurantId), eq(restaurants.status, "active"))).limit(1);
    if (!restaurant) throw new Error("RESTAURANT_NOT_FOUND");
    const lines = await priceMenuLines(tx, input.restaurantId, input.items);
    const subtotalKopecks = lines.reduce((sum: number, line: any) => sum + line.lineTotalKopecks, 0);
    const { promo, discountKopecks } = await resolvePromo(tx, input.restaurantId, userId, input.promoCode, subtotalKopecks);
    const pricedSubtotalKopecks = Math.max(0, subtotalKopecks - discountKopecks);
    const deliveryFeeKopecks = calculateDeliveryFee(restaurant, pricedSubtotalKopecks, input.fulfillment);
    return { restaurantId: input.restaurantId, lines, subtotalKopecks, freeDeliveryThresholdKopecks: restaurant.freeDeliveryThresholdKopecks, deliveryFeeKopecks, promoDiscountKopecks: discountKopecks, discountKopecks: lines.reduce((sum: number, line: any) => sum + line.discountKopecks * line.quantity, 0) + discountKopecks, totalKopecks: Math.max(0, subtotalKopecks - discountKopecks + deliveryFeeKopecks), promoCode: promo?.code ?? null };
  });
}

export async function getPublicRestaurantMenu(restaurantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [restaurant] = await db.select().from(restaurants).where(and(eq(restaurants.id, restaurantId), eq(restaurants.status, "active"))).limit(1);
  if (!restaurant) throw new Error("RESTAURANT_NOT_FOUND");
  const [categories, rawItems, hours, discounts] = await Promise.all([
    db.select().from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId)).orderBy(menuCategories.sortOrder, menuCategories.id),
    db.select().from(menuItems).where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.available, 1))).orderBy(menuItems.id),
    db.select().from(restaurantHours).where(eq(restaurantHours.restaurantId, restaurantId)).orderBy(restaurantHours.dayOfWeek),
    db.select().from(menuDiscounts).where(eq(menuDiscounts.restaurantId, restaurantId)),
  ]);
  const items = (rawItems as Array<typeof menuItems.$inferSelect>).map((item) => ({ ...item, originalPriceKopecks: item.priceKopecks, ...discountedPrice(item.priceKopecks, activeDiscount(discounts, item)) }));
  const hasActivePromotion = items.some((item) => item.discountKopecks > 0);
  return { restaurant: { ...restaurant, city: cityFromAddress(restaurant.address) }, categories, items, hours, hasActivePromotion, openStatus: getRestaurantOpenStatus(hours) };
}

export async function createCustomerOrder(userId: number, input: {
  restaurantId: number; items: { menuItemId: number; quantity: number }[]; fulfillment: "delivery" | "pickup"; paymentMethod: "cash"; idempotencyKey: string; address: string; contactPhone?: string; customerComment?: string; promoCode?: string;
}) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: orders.id, customerId: orders.customerId, totalKopecks: orders.totalKopecks, status: orders.status }).from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) { if (existing.customerId !== userId) throw new Error("IDEMPOTENCY_KEY_CONFLICT"); return { orderId: existing.id, totalKopecks: existing.totalKopecks, status: existing.status, replayed: true }; }
    const [restaurant] = await tx.select().from(restaurants).where(and(eq(restaurants.id, input.restaurantId), eq(restaurants.status, "active"))).limit(1);
    if (!restaurant) throw new Error("RESTAURANT_NOT_FOUND");
    const lines = await priceMenuLines(tx, input.restaurantId, input.items);
    const subtotalKopecks = lines.reduce((sum, line) => sum + line.lineTotalKopecks, 0);
    const { promo, discountKopecks: promoDiscountKopecks } = await resolvePromo(tx, input.restaurantId, userId, input.promoCode, subtotalKopecks);
    const itemDiscountKopecks = lines.reduce((sum, line) => sum + line.discountKopecks * line.quantity, 0);
    const pricedSubtotalKopecks = Math.max(0, subtotalKopecks - promoDiscountKopecks);
    const deliveryFeeKopecks = calculateDeliveryFee(restaurant, pricedSubtotalKopecks, input.fulfillment);
    const totalKopecks = Math.max(0, pricedSubtotalKopecks + deliveryFeeKopecks);
    const orderResult = await tx.insert(orders).values({ customerId: userId, restaurantId: input.restaurantId, fulfillment: input.fulfillment, paymentMethod: input.paymentMethod, idempotencyKey: input.idempotencyKey, address: input.address.trim(), contactPhone: input.contactPhone?.trim() || null, customerComment: input.customerComment?.trim() || null, deliveryFeeKopecks, subtotalKopecks, discountKopecks: itemDiscountKopecks + promoDiscountKopecks, promoCode: promo?.code ?? null, totalKopecks, status: "placed" });
    const orderId = Number(orderResult[0].insertId);
    await tx.insert(orderItems).values(lines.map((line) => ({ orderId, ...line })));
    if (promo) { await tx.update(promoCodes).set({ usageCount: sql`${promoCodes.usageCount} + 1` }).where(eq(promoCodes.id, promo.id)); await tx.insert(promoCodeUsages).values({ promoCodeId: promo.id, restaurantId: input.restaurantId, orderId, customerId: userId, discountKopecks: promoDiscountKopecks }); }
    await tx.insert(orderStatusHistory).values({ orderId, status: "placed", changedByUserId: userId, reason: "Заказ оформлен клиентом" });
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, input.restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    if (owners.length > 0) await tx.insert(notifications).values(owners.map((owner) => ({ userId: owner.userId, restaurantId: input.restaurantId, orderId, type: "new_order" as const, title: NEW_ORDER_NOTIFICATION_TITLE, body: `Заказ #${orderId} на ${(totalKopecks / 100).toFixed(2)} ₽ ожидает подтверждения.` })));
    const ownerTokens = owners.length ? await tx.select({ token: pushTokens.token }).from(pushTokens).where(and(inArray(pushTokens.userId, owners.map((owner) => owner.userId)), eq(pushTokens.active, 1))) : [];
    return { orderId, totalKopecks, status: "placed" as const, ownerUserIds: owners.map((owner) => owner.userId), ownerTokens: ownerTokens.map((item) => item.token), replayed: false };
  });
  if (result.replayed) return result;
  const ownerUserIds = ("ownerUserIds" in result ? result.ownerUserIds : []) ?? [];
  const ownerTokens = ("ownerTokens" in result ? result.ownerTokens : []) ?? [];
  for (const ownerUserId of ownerUserIds) broadcastToUser(ownerUserId, { type: "order.created", orderId: result.orderId, status: result.status });
  void sendExpoPushNotifications(ownerTokens, { title: NEW_ORDER_NOTIFICATION_TITLE, body: `Заказ #${result.orderId} ожидает подтверждения.`, data: { orderId: result.orderId, type: "new_order" } });
  return { orderId: result.orderId, totalKopecks: result.totalKopecks, status: result.status, replayed: false };
}
export async function listCustomerOrders(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.select({ id: orders.id, status: orders.status, fulfillment: orders.fulfillment, address: orders.address, totalKopecks: orders.totalKopecks, subtotalKopecks: orders.subtotalKopecks, discountKopecks: orders.discountKopecks, promoCode: orders.promoCode, createdAt: orders.createdAt, restaurantName: restaurants.name }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(eq(orders.customerId, userId)).orderBy(desc(orders.createdAt));
}

export async function getCustomerOrderDetails(userId: number, orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [order] = await db.select({ id: orders.id, status: orders.status, fulfillment: orders.fulfillment, paymentMethod: orders.paymentMethod, address: orders.address, contactPhone: orders.contactPhone, customerComment: orders.customerComment, totalKopecks: orders.totalKopecks, subtotalKopecks: orders.subtotalKopecks, discountKopecks: orders.discountKopecks, promoCode: orders.promoCode, deliveryFeeKopecks: orders.deliveryFeeKopecks, createdAt: orders.createdAt, updatedAt: orders.updatedAt, restaurantName: restaurants.name, restaurantPhone: restaurants.phone }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(and(eq(orders.id, orderId), eq(orders.customerId, userId))).limit(1);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const [items, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(desc(orderStatusHistory.createdAt)),
  ]);
  return { order, items, history };
}

export async function cancelCustomerOrder(userId: number, orderId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, userId))).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!["placed", "restaurant_confirmed"].includes(order.status)) throw new Error("CANNOT_CANCEL_ORDER");
    const note = reason?.trim() || "Отменено клиентом";
    await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, status: "cancelled", changedByUserId: userId, reason: note });
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, order.restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    if (owners.length) await tx.insert(notifications).values(owners.map((owner) => ({ userId: owner.userId, restaurantId: order.restaurantId, orderId, type: "order_status" as const, title: "Заказ отменён", body: `Клиент отменил заказ #${orderId}.` })));
    return { orderId, status: "cancelled" as const };
  });
}

export async function submitCustomerOrderComplaint(userId: number, orderId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, userId))).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!["delivered", "completed"].includes(order.status)) throw new Error("COMPLAINT_NOT_AVAILABLE");
    await tx.insert(orderStatusHistory).values({ orderId, status: "complaint", changedByUserId: userId, reason: reason.trim() });
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, order.restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    if (owners.length) await tx.insert(notifications).values(owners.map((owner) => ({ userId: owner.userId, restaurantId: order.restaurantId, orderId, type: "order_status" as const, title: "Жалоба по заказу", body: `Поступила жалоба по заказу #${orderId}.` })));
    return { orderId, submitted: true };
  });
}

export async function listOwnerOrders(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const ownerOrders = await db!.select().from(orders).where(eq(orders.restaurantId, restaurantId)).orderBy(desc(orders.createdAt));
  const items = ownerOrders.length ? await db!.select().from(orderItems).where(inArray(orderItems.orderId, ownerOrders.map((order) => order.id))) : [];
  const assignments = ownerOrders.length ? await db!.select({ assignment: orderDriverAssignments, driver: deliveryDrivers })
    .from(orderDriverAssignments).innerJoin(deliveryDrivers, eq(deliveryDrivers.id, orderDriverAssignments.driverId))
    .where(inArray(orderDriverAssignments.orderId, ownerOrders.map((order) => order.id))) : [];
  return ownerOrders.map((order) => ({
    ...order,
    items: items.filter((item) => item.orderId === order.id),
    activeAssignment: assignments.find((item) => item.assignment.orderId === order.id && ["assigned", "accepted", "picked_up"].includes(item.assignment.status)) ?? null,
  }));
}

const ownerOrderTransitions: Record<string, string[]> = {
  placed: ["restaurant_confirmed", "restaurant_rejected"],
  restaurant_confirmed: ["preparing", "restaurant_rejected"],
  preparing: ["ready"],
  ready: ["completed"],
  courier_assigned: ["handed_to_courier"],
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
    if (status === "completed" && order.fulfillment !== "pickup" && order.status !== "delivered") throw new Error("INVALID_ORDER_TRANSITION");
    let handoffDriverUserId: number | null = null;
    let handoffDriverTokens: string[] = [];
    if (status === "handed_to_courier") {
      const [assignment] = await tx.select({ assignment: orderDriverAssignments, driver: deliveryDrivers })
        .from(orderDriverAssignments).innerJoin(deliveryDrivers, eq(deliveryDrivers.id, orderDriverAssignments.driverId))
        .where(eq(orderDriverAssignments.orderId, orderId)).limit(1);
      if (!assignment || assignment.assignment.status !== "accepted") throw new Error("COURIER_MUST_ACCEPT_FIRST");
      handoffDriverUserId = assignment.driver.userId;
      await tx.insert(notifications).values({ userId: handoffDriverUserId, restaurantId, orderId, type: "order_status", title: "Заказ передан вам", body: `Заведение передало заказ #${orderId}. Можно забрать его.` });
      handoffDriverTokens = (await tx.select({ token: pushTokens.token }).from(pushTokens).where(and(eq(pushTokens.userId, handoffDriverUserId), eq(pushTokens.active, 1)))).map((item) => item.token);
    }
    await tx.update(orders).set({ status: status as typeof order.status, restaurantComment: reason?.trim() || null }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, status: status as typeof order.status, changedByUserId: userId, reason: reason?.trim() || null });
    await tx.insert(notifications).values({ userId: order.customerId, restaurantId, orderId, type: "order_status", title: "Статус заказа изменён", body: `Заказ #${orderId}: ${orderStatusTitles[status] ?? status}.` });
    const customerTokens = await tx.select({ token: pushTokens.token }).from(pushTokens).where(and(eq(pushTokens.userId, order.customerId), eq(pushTokens.active, 1)));
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    return { orderId, status, customerId: order.customerId, customerTokens: customerTokens.map((item) => item.token), ownerUserIds: owners.map((owner) => owner.userId), handoffDriverUserId, handoffDriverTokens };
  });
  broadcastToUser(result.customerId, { type: "order.status_changed", orderId: result.orderId, status: result.status });
  for (const ownerUserId of result.ownerUserIds) broadcastToUser(ownerUserId, { type: "order.status_changed", orderId: result.orderId, status: result.status });
  if (result.handoffDriverUserId) broadcastToUser(result.handoffDriverUserId, { type: "order.status_changed", orderId: result.orderId, status: result.status });
  void sendExpoPushNotifications(result.customerTokens, { title: "Статус заказа изменён", body: `Заказ #${result.orderId}: ${orderStatusTitles[result.status] ?? result.status}.`, data: { orderId: result.orderId, status: result.status, type: "order_status" } });
  if (result.handoffDriverTokens.length) void sendExpoPushNotifications(result.handoffDriverTokens, { title: "Заказ передан вам", body: `Заведение передало заказ #${result.orderId}. Можно забрать его.`, data: { orderId: result.orderId, status: result.status, type: "order_status" } });
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
  const normalizedPhone = normalizeTeamPhone(input.phone);
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, role: users.role })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!account || !account.phoneVerifiedAt) throw new Error("TEAM_PHONE_NOT_VERIFIED");
    if (account.phone !== normalizedPhone) throw new Error("TEAM_PHONE_MISMATCH");
    if (account.role !== "user") throw new Error("TEAM_ACCOUNT_ROLE_PROTECTED");
    const [existing] = await tx.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
    if (existing?.status === "busy") throw new Error("DRIVER_BUSY_PROFILE_LOCKED");
    if (existing?.status === "suspended") throw new Error("DRIVER_SUSPENDED");
    if (existing) {
      await tx.update(deliveryDrivers).set({ displayName: input.displayName.trim(), phone: normalizedPhone, vehicle: input.vehicle?.trim() || null, updatedAt: new Date() }).where(eq(deliveryDrivers.id, existing.id));
    } else {
      await tx.insert(deliveryDrivers).values({ userId, displayName: input.displayName.trim(), phone: normalizedPhone, vehicle: input.vehicle?.trim() || null, status: "available" });
    }
    const [driver] = await tx.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
    return driver;
  });
}

export async function getDriverProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [driver] = await db.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
  if (!driver) throw new Error("DRIVER_NOT_FOUND");
  return driver;
}

export async function setDriverAvailability(userId: number, status: "available" | "offline") {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async (tx) => {
    const [driver] = await tx.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
    if (!driver) throw new Error("DRIVER_NOT_FOUND");
    if (driver.status === "suspended") throw new Error("DRIVER_SUSPENDED");
    const activeAssignments = await tx.select({ id: orderDriverAssignments.id }).from(orderDriverAssignments).where(and(
      eq(orderDriverAssignments.driverId, driver.id),
      inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"]),
    ));
    if (activeAssignments.length) throw new Error("COURIER_HAS_ACTIVE_ORDER");
    await tx.update(deliveryDrivers).set({ status }).where(eq(deliveryDrivers.id, driver.id));
    return { status };
  });
}

export async function addOwnerCourier(userId: number, input: { phone: string; displayName: string; vehicle?: string }) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const normalizedPhone = normalizeTeamPhone(input.phone);
  return db!.transaction(async (tx) => {
    await requireRestaurantOwner(tx as unknown as NonNullable<Awaited<ReturnType<typeof getDb>>>, userId, restaurantId);
    const [courierUser] = await tx.select({ id: users.id, role: users.role, phoneVerifiedAt: users.phoneVerifiedAt })
      .from(users).where(eq(users.phone, normalizedPhone)).limit(1);
    if (!courierUser) throw new Error("TEAM_USER_NOT_FOUND");
    if (!courierUser.phoneVerifiedAt) throw new Error("TEAM_PHONE_NOT_VERIFIED");
    if (courierUser.role !== "user") throw new Error("TEAM_ACCOUNT_ROLE_PROTECTED");
    const existingMemberships = await tx.select({ restaurantId: restaurantMembers.restaurantId, role: restaurantMembers.role })
      .from(restaurantMembers).where(eq(restaurantMembers.userId, courierUser.id));
    assertTeamRoleAvailable(existingMemberships.filter((item) => item.restaurantId === restaurantId).map((item) => item.role), "staff");
    if (existingMemberships.some((item) => item.restaurantId !== restaurantId && item.role === "staff")) {
      throw new Error("COURIER_ASSIGNED_ELSEWHERE");
    }
    const [existingDriver] = await tx.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, courierUser.id)).limit(1);
    if (existingDriver?.status === "busy") throw new Error("DRIVER_BUSY_PROFILE_LOCKED");
    if (existingDriver?.status === "suspended") throw new Error("DRIVER_SUSPENDED");
    if (existingDriver) {
      await tx.update(deliveryDrivers).set({ displayName: input.displayName.trim(), phone: normalizedPhone, vehicle: input.vehicle?.trim() || null, updatedAt: new Date() }).where(eq(deliveryDrivers.id, existingDriver.id));
    } else {
      await tx.insert(deliveryDrivers).values({ userId: courierUser.id, displayName: input.displayName.trim(), phone: normalizedPhone, vehicle: input.vehicle?.trim() || null, status: "available" });
    }
    await tx.insert(restaurantMembers).values({ restaurantId, userId: courierUser.id, role: "staff" });
    const [driver] = await tx.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, courierUser.id)).limit(1);
    return driver;
  });
}

export async function updateOwnerCourier(userId: number, driverId: number, input: { displayName: string; phone: string; vehicle?: string }) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [driver] = await db!.select({ driver: deliveryDrivers }).from(deliveryDrivers).innerJoin(restaurantMembers, and(eq(restaurantMembers.userId, deliveryDrivers.userId), eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "staff"))).where(eq(deliveryDrivers.id, driverId)).limit(1).then((rows) => rows.map((row) => row.driver));
  if (!driver) throw new Error("COURIER_NOT_FOUND");
  const normalizedPhone = normalizeTeamPhone(input.phone);
  const [account] = await db!.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, driver.userId)).limit(1);
  if (!account?.phoneVerifiedAt || account.phone !== normalizedPhone) throw new Error("TEAM_PHONE_MISMATCH");
  await db!.update(deliveryDrivers).set({ displayName: input.displayName.trim(), phone: normalizedPhone, vehicle: input.vehicle?.trim() || null }).where(eq(deliveryDrivers.id, driverId));
  return { id: driverId, updated: true };
}

export async function setOwnerCourierStatus(userId: number, driverId: number, status: "available" | "offline" | "suspended") {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [driver] = await db!.select({ id: deliveryDrivers.id, status: deliveryDrivers.status }).from(deliveryDrivers).innerJoin(restaurantMembers, and(eq(restaurantMembers.userId, deliveryDrivers.userId), eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "staff"))).where(eq(deliveryDrivers.id, driverId)).limit(1);
  if (!driver) throw new Error("COURIER_NOT_FOUND");
  if (status !== "available") {
    const [assignment] = await db!.select({ id: orderDriverAssignments.id }).from(orderDriverAssignments).where(and(
      eq(orderDriverAssignments.driverId, driverId),
      inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"]),
    )).limit(1);
    if (assignment) throw new Error("COURIER_HAS_ACTIVE_ORDER");
  }
  if (status === "available" && driver.status === "busy") {
    const [assignment] = await db!.select({ id: orderDriverAssignments.id }).from(orderDriverAssignments).where(and(
      eq(orderDriverAssignments.driverId, driverId),
      inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"]),
    )).limit(1);
    if (assignment) throw new Error("COURIER_HAS_ACTIVE_ORDER");
  }
  await db!.update(deliveryDrivers).set({ status }).where(eq(deliveryDrivers.id, driverId));
  return { id: driverId, status };
}

export async function deleteOwnerCourier(userId: number, driverId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const [driver] = await db!.select({ id: deliveryDrivers.id, userId: deliveryDrivers.userId }).from(deliveryDrivers).innerJoin(restaurantMembers, and(eq(restaurantMembers.userId, deliveryDrivers.userId), eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "staff"))).where(eq(deliveryDrivers.id, driverId)).limit(1);
  if (!driver) throw new Error("COURIER_NOT_FOUND");
  const [assignment] = await db!.select({ id: orderDriverAssignments.id }).from(orderDriverAssignments).where(and(eq(orderDriverAssignments.driverId, driverId), inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"]))).limit(1);
  if (assignment) throw new Error("COURIER_HAS_ACTIVE_ORDER");
  await db!.delete(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.userId, driver.userId), eq(restaurantMembers.role, "staff")));
  return { id: driverId, deleted: true };
}

export async function listOwnerDrivers(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  return db!.select({ driver: deliveryDrivers }).from(deliveryDrivers).innerJoin(restaurantMembers, and(eq(restaurantMembers.userId, deliveryDrivers.userId), eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "staff"))).where(eq(deliveryDrivers.status, "available")).orderBy(deliveryDrivers.displayName).then((rows) => rows.map((row) => row.driver));
}

export async function listOwnerCouriers(userId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  return db!.select({ driver: deliveryDrivers }).from(deliveryDrivers).innerJoin(restaurantMembers, and(eq(restaurantMembers.userId, deliveryDrivers.userId), eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "staff"))).orderBy(deliveryDrivers.displayName).then((rows) => rows.map((row) => row.driver));
}

export async function assignDriverToOrder(userId: number, orderId: number, driverId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.fulfillment !== "delivery") throw new Error("ORDER_NOT_DELIVERY");
    if (order.status !== "ready") throw new Error("ORDER_NOT_READY");
    const [driver] = await tx.select({ driver: deliveryDrivers }).from(deliveryDrivers).innerJoin(restaurantMembers, and(eq(restaurantMembers.userId, deliveryDrivers.userId), eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "staff"))).where(and(eq(deliveryDrivers.id, driverId), eq(deliveryDrivers.status, "available"))).limit(1).then((rows) => rows.map((row) => row.driver));
    if (!driver) throw new Error("DRIVER_NOT_AVAILABLE");
    const [existing] = await tx.select().from(orderDriverAssignments).where(eq(orderDriverAssignments.orderId, orderId)).limit(1);
    if (existing && existing.status !== "cancelled") throw new Error("DRIVER_ALREADY_ASSIGNED");
    const claimed = await tx.update(deliveryDrivers).set({ status: "busy" }).where(and(eq(deliveryDrivers.id, driverId), eq(deliveryDrivers.status, "available")));
    if (!claimed[0].affectedRows) throw new Error("DRIVER_NOT_AVAILABLE");
    if (existing?.status === "cancelled") await tx.update(orderDriverAssignments).set({ driverId, assignedByUserId: userId, status: "assigned", assignedAt: new Date() }).where(eq(orderDriverAssignments.id, existing.id));
    else await tx.insert(orderDriverAssignments).values({ orderId, driverId, assignedByUserId: userId, status: "assigned" });
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

export async function transferDriverToOrder(userId: number, orderId: number, nextDriverId: number) {
  const db = await getDb();
  const restaurantId = await getOwnedRestaurantId(db, userId);
  const result = await db!.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.fulfillment !== "delivery" || order.status !== "courier_assigned") throw new Error("ORDER_NOT_TRANSFERABLE");
    const [current] = await tx.select({ assignment: orderDriverAssignments, driver: deliveryDrivers })
      .from(orderDriverAssignments).innerJoin(deliveryDrivers, eq(deliveryDrivers.id, orderDriverAssignments.driverId))
      .where(eq(orderDriverAssignments.orderId, orderId)).limit(1);
    if (!current || !["assigned", "accepted"].includes(current.assignment.status)) throw new Error("ORDER_NOT_TRANSFERABLE");
    if (current.driver.id === nextDriverId) throw new Error("SAME_DRIVER");
    const [nextDriver] = await tx.select({ driver: deliveryDrivers }).from(deliveryDrivers)
      .innerJoin(restaurantMembers, and(eq(restaurantMembers.userId, deliveryDrivers.userId), eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.role, "staff")))
      .where(and(eq(deliveryDrivers.id, nextDriverId), eq(deliveryDrivers.status, "available"))).limit(1).then((rows) => rows.map((row) => row.driver));
    if (!nextDriver) throw new Error("DRIVER_NOT_AVAILABLE");
    const claimed = await tx.update(deliveryDrivers).set({ status: "busy" }).where(and(eq(deliveryDrivers.id, nextDriver.id), eq(deliveryDrivers.status, "available")));
    if (!claimed[0].affectedRows) throw new Error("DRIVER_NOT_AVAILABLE");
    await tx.update(orderDriverAssignments).set({ driverId: nextDriver.id, assignedByUserId: userId, status: "assigned", assignedAt: new Date() }).where(eq(orderDriverAssignments.id, current.assignment.id));
    const previousAssignments = await tx.select({ id: orderDriverAssignments.id }).from(orderDriverAssignments).where(and(
      eq(orderDriverAssignments.driverId, current.driver.id),
      inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"]),
    ));
    if (!previousAssignments.length) await tx.update(deliveryDrivers).set({ status: "available" }).where(eq(deliveryDrivers.id, current.driver.id));
    const reason = `Заказ передан от курьера ${current.driver.displayName} курьеру ${nextDriver.displayName}`;
    await tx.insert(orderStatusHistory).values({ orderId, status: "courier_assigned", changedByUserId: userId, reason });
    const customerBody = `Заказ #${orderId} передан курьеру ${nextDriver.displayName}.`;
    await tx.insert(notifications).values([
      { userId: order.customerId, restaurantId, orderId, type: "order_status", title: "Курьер изменён", body: customerBody },
      { userId: current.driver.userId, restaurantId, orderId, type: "order_status", title: "Заказ передан другому курьеру", body: `Заказ #${orderId} передан коллеге.` },
      { userId: nextDriver.userId, restaurantId, orderId, type: "order_status", title: "Вам передан заказ", body: `Вам назначен заказ #${orderId}.` },
    ]);
    const recipients = [order.customerId, current.driver.userId, nextDriver.userId];
    const tokens = await tx.select({ token: pushTokens.token, userId: pushTokens.userId }).from(pushTokens)
      .where(and(inArray(pushTokens.userId, recipients), eq(pushTokens.active, 1)));
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    return {
      orderId,
      customerId: order.customerId,
      oldDriverUserId: current.driver.userId,
      nextDriverUserId: nextDriver.userId,
      ownerUserIds: owners.map((owner) => owner.userId),
      tokens,
      nextDriverName: nextDriver.displayName,
    };
  });
  broadcastToUser(result.customerId, { type: "order.status_changed", orderId, status: "courier_assigned" });
  broadcastToUser(result.oldDriverUserId, { type: "driver.assignment_removed", orderId });
  broadcastToUser(result.nextDriverUserId, { type: "driver.assignment_created", orderId, status: "courier_assigned" });
  for (const ownerUserId of result.ownerUserIds) broadcastToUser(ownerUserId, { type: "order.status_changed", orderId, status: "courier_assigned" });
  for (const recipient of [result.customerId, result.oldDriverUserId, result.nextDriverUserId]) {
    const tokens = result.tokens.filter((item) => item.userId === recipient).map((item) => item.token);
    if (tokens.length) void sendExpoPushNotifications(tokens, { title: "Изменение курьера", body: `Заказ #${orderId}: назначен курьер ${result.nextDriverName}.`, data: { orderId, type: "driver_assignment" } });
  }
  return { orderId, status: "courier_assigned" as const, driverName: result.nextDriverName, transferred: true };
}

export async function listDriverAssignments(userId: number) {
  const db = await getDb();
  const [driver] = await db!.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
  if (!driver) throw new Error("DRIVER_NOT_FOUND");
  const rows = await db!.select({ assignment: orderDriverAssignments, order: orders, restaurant: restaurants, accountPhone: users.phone })
    .from(orderDriverAssignments).innerJoin(orders, eq(orders.id, orderDriverAssignments.orderId))
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).innerJoin(users, eq(users.id, orders.customerId))
    .where(and(eq(orderDriverAssignments.driverId, driver.id), inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"])))
    .orderBy(desc(orderDriverAssignments.updatedAt));
  const assignments = rows.map(({ accountPhone, order, ...item }) => ({ ...item, order: { ...order, contactPhone: order.contactPhone ?? accountPhone } }));
  return { driver, assignments };
}

export async function updateDriverAssignmentStatus(userId: number, orderId: number, status: "accepted" | "picked_up" | "delivered") {
  const db = await getDb();
  const result = await db!.transaction(async (tx) => {
    const [driver] = await tx.select().from(deliveryDrivers).where(eq(deliveryDrivers.userId, userId)).limit(1);
    if (!driver) throw new Error("DRIVER_NOT_FOUND");
    const [assignment] = await tx.select().from(orderDriverAssignments).where(and(eq(orderDriverAssignments.orderId, orderId), eq(orderDriverAssignments.driverId, driver.id))).limit(1);
    if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const allowed: Record<string, string[]> = { assigned: ["accepted"], accepted: ["picked_up"], picked_up: ["delivered"] };
    if (!allowed[assignment.status]?.includes(status)) throw new Error("INVALID_DRIVER_TRANSITION");
    if (status === "accepted" && order.status !== "courier_assigned") throw new Error("INVALID_DRIVER_TRANSITION");
    if (status === "picked_up" && order.status !== "handed_to_courier") throw new Error("ORDER_NOT_HANDED_OFF");
    if (status === "delivered" && order.status !== "in_transit") throw new Error("INVALID_DRIVER_TRANSITION");
    const nextOrderStatus = status === "picked_up" ? "in_transit" : status === "delivered" ? "delivered" : "courier_assigned";
    await tx.update(orderDriverAssignments).set({ status }).where(eq(orderDriverAssignments.id, assignment.id));
    await tx.update(orders).set({ status: nextOrderStatus }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, status: nextOrderStatus, changedByUserId: userId, reason: `Статус курьера: ${status}` });
    if (status === "delivered") {
      const remaining = await tx.select({ id: orderDriverAssignments.id }).from(orderDriverAssignments).where(and(
        eq(orderDriverAssignments.driverId, driver.id),
        inArray(orderDriverAssignments.status, ["assigned", "accepted", "picked_up"]),
      ));
      if (!remaining.length) await tx.update(deliveryDrivers).set({ status: "available" }).where(eq(deliveryDrivers.id, driver.id));
    }
    const body = `Заказ #${orderId}: ${orderStatusTitles[nextOrderStatus] ?? nextOrderStatus}.`;
    await tx.insert(notifications).values({ userId: order.customerId, restaurantId: order.restaurantId, orderId, type: "order_status", title: "Статус заказа изменён", body });
    const customerTokens = await tx.select({ token: pushTokens.token }).from(pushTokens).where(and(eq(pushTokens.userId, order.customerId), eq(pushTokens.active, 1)));
    const owners = await tx.select({ userId: restaurantMembers.userId }).from(restaurantMembers).where(and(eq(restaurantMembers.restaurantId, order.restaurantId), inArray(restaurantMembers.role, ["owner", "manager"])));
    return { orderId, customerId: order.customerId, restaurantId: order.restaurantId, driverUserId: userId, status: nextOrderStatus, customerTokens: customerTokens.map((token) => token.token), ownerUserIds: owners.map((owner) => owner.userId) };
  });
  broadcastToUser(result.customerId, { type: "order.status_changed", orderId, status: result.status });
  broadcastToUser(result.driverUserId, { type: "order.status_changed", orderId, status: result.status });
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

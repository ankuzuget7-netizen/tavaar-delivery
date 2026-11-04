import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertRestaurantApplication,
  InsertUser,
  menuCategories,
  menuItems,
  restaurantApplications,
  restaurantHours,
  restaurantMembers,
  restaurants,
  users,
} from "../drizzle/schema";
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
  status: "approved" | "rejected" | "suspended",
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

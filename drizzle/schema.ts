import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const restaurantApplications = mysqlTable("restaurant_applications", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 80 }).notNull(),
  address: varchar("address", { length: 240 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  contact: varchar("contact", { length: 120 }).notNull(),
  description: text("description"),
  submittedByUserId: int("submittedByUserId").references(() => users.id),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "suspended"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RestaurantApplication = typeof restaurantApplications.$inferSelect;
export type InsertRestaurantApplication = typeof restaurantApplications.$inferInsert;

export const restaurants = mysqlTable("restaurants", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull().references(() => restaurantApplications.id).unique(),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 80 }).notNull(),
  address: varchar("address", { length: 240 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "suspended", "blocked"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = typeof restaurants.$inferInsert;

export const restaurantMembers = mysqlTable("restaurant_members", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().references(() => restaurants.id),
  userId: int("userId").notNull().references(() => users.id),
  role: mysqlEnum("role", ["owner", "manager", "staff"]).default("owner").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  restaurantUserRole: uniqueIndex("restaurant_members_restaurant_user_role").on(table.restaurantId, table.userId, table.role),
}));

export type RestaurantMember = typeof restaurantMembers.$inferSelect;
export type InsertRestaurantMember = typeof restaurantMembers.$inferInsert;

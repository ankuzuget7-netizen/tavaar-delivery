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

export const menuCategories = mysqlTable("menu_categories", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().references(() => restaurants.id),
  name: varchar("name", { length: 120 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;

export const menuItems = mysqlTable("menu_items", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().references(() => restaurants.id),
  categoryId: int("categoryId").notNull().references(() => menuCategories.id),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  priceKopecks: int("priceKopecks").notNull(),
  prepMinutes: int("prepMinutes").default(30).notNull(),
  available: int("available").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

export const restaurantHours = mysqlTable("restaurant_hours", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().references(() => restaurants.id),
  dayOfWeek: int("dayOfWeek").notNull(),
  startTime: varchar("startTime", { length: 5 }).notNull(),
  endTime: varchar("endTime", { length: 5 }).notNull(),
  isClosed: int("isClosed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  restaurantDay: uniqueIndex("restaurant_hours_restaurant_day").on(table.restaurantId, table.dayOfWeek),
}));

export type RestaurantHours = typeof restaurantHours.$inferSelect;
export type InsertRestaurantHours = typeof restaurantHours.$inferInsert;

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().references(() => users.id),
  restaurantId: int("restaurantId").notNull().references(() => restaurants.id),
  status: mysqlEnum("status", ["placed", "restaurant_confirmed", "preparing", "ready", "courier_assigned", "handed_to_courier", "in_transit", "delivered", "completed", "cancelled", "restaurant_rejected", "payment_error", "refunded", "complaint"]).default("placed").notNull(),
  fulfillment: mysqlEnum("fulfillment", ["delivery", "pickup"]).default("delivery").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }).unique(),
  address: varchar("address", { length: 400 }).notNull(),
  contactPhone: varchar("contactPhone", { length: 32 }),
  deliveryFeeKopecks: int("deliveryFeeKopecks").default(0).notNull(),
  totalKopecks: int("totalKopecks").notNull(),
  customerComment: text("customerComment"),
  restaurantComment: text("restaurantComment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  menuItemId: int("menuItemId").notNull().references(() => menuItems.id),
  nameSnapshot: varchar("nameSnapshot", { length: 160 }).notNull(),
  priceKopecks: int("priceKopecks").notNull(),
  quantity: int("quantity").notNull(),
  lineTotalKopecks: int("lineTotalKopecks").notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

export const orderStatusHistory = mysqlTable("order_status_history", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  status: mysqlEnum("status", ["placed", "restaurant_confirmed", "preparing", "ready", "courier_assigned", "handed_to_courier", "in_transit", "delivered", "completed", "cancelled", "restaurant_rejected", "payment_error", "refunded", "complaint"]).notNull(),
  changedByUserId: int("changedByUserId").references(() => users.id),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  restaurantId: int("restaurantId").references(() => restaurants.id),
  orderId: int("orderId").references(() => orders.id),
  type: mysqlEnum("type", ["new_order", "order_status", "system"]).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;

export const pushTokens = mysqlTable("push_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  token: varchar("token", { length: 512 }).notNull().unique(),
  platform: varchar("platform", { length: 32 }).notNull(),
  active: int("active").default(1).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PushToken = typeof pushTokens.$inferSelect;

export const deliveryDrivers = mysqlTable("delivery_drivers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id).unique(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  vehicle: varchar("vehicle", { length: 120 }),
  status: mysqlEnum("status", ["offline", "available", "busy", "suspended"]).default("available").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeliveryDriver = typeof deliveryDrivers.$inferSelect;

export const orderDriverAssignments = mysqlTable("order_driver_assignments", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id).unique(),
  driverId: int("driverId").notNull().references(() => deliveryDrivers.id),
  assignedByUserId: int("assignedByUserId").notNull().references(() => users.id),
  status: mysqlEnum("status", ["assigned", "accepted", "picked_up", "delivered", "cancelled"]).default("assigned").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OrderDriverAssignment = typeof orderDriverAssignments.$inferSelect;

export const driverLocations = mysqlTable("driver_locations", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  driverId: int("driverId").notNull().references(() => deliveryDrivers.id),
  latitudeE6: int("latitudeE6").notNull(),
  longitudeE6: int("longitudeE6").notNull(),
  accuracyCm: int("accuracyCm"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type DriverLocation = typeof driverLocations.$inferSelect;

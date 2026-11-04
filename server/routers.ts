import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import {
  approveRestaurantApplication,
  createRestaurantApplication,
  listPublicRestaurants,
  searchPublicCatalog,
  listRestaurantApplications,
  createOwnerMenuCategory,
  createOwnerMenuItem,
  createCustomerOrder,
  getRestaurantOwnerDashboard,
  getPublicRestaurantMenu,
  listCustomerOrders,
  listOwnerNotifications,
  listOwnerOrders,
  markOwnerNotificationRead,
  registerPushToken,
  deactivatePushToken,
  registerDeliveryDriver,
  getDriverProfile,
  listOwnerDrivers,
  assignDriverToOrder,
  listDriverAssignments,
  updateDriverAssignmentStatus,
  updateDriverLocation,
  getCustomerOrderTracking,
  setOwnerMenuItemAvailability,
  updateOwnerOrderStatus,
  updateRestaurantApplicationStatus,
  upsertOwnerHours,
} from "./db";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(getSessionCookieName(ctx.req), {
        ...cookieOptions,
        maxAge: -1,
      });
      return {
        success: true,
      } as const;
    }),
  }),

  restaurantApplications: router({
    submit: publicProcedure
      .input(z.object({
        name: z.string().trim().min(2).max(160),
        type: z.string().trim().min(2).max(80),
        address: z.string().trim().min(5).max(240),
        phone: z.string().trim().min(7).max(32),
        contact: z.string().trim().min(2).max(120),
        description: z.string().trim().max(4000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await createRestaurantApplication(input, ctx.user?.id);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось сохранить заявку. Попробуйте позже." });
        }
      }),
    list: adminProcedure.query(async () => {
      try {
        return await listRestaurantApplications();
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось загрузить заявки." });
      }
    }),
    approve: adminProcedure
      .input(z.object({ applicationId: z.number().int().positive(), ownerUserId: z.number().int().positive().optional() }))
      .mutation(async ({ input }) => {
        try {
          return await approveRestaurantApplication(input);
        } catch (error) {
          if (error instanceof Error && error.message === "APPLICATION_NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Заявка не найдена." });
          }
          if (error instanceof Error && error.message === "OWNER_NOT_FOUND") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Пользователь-владелец не найден. Проверьте ID аккаунта." });
          }
          if (error instanceof Error && error.message === "OWNER_REQUIRED") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "У заявки нет связанного аккаунта. Укажите ID существующего пользователя." });
          }
          if (error instanceof Error && error.message === "APPLICATION_NOT_PENDING") {
            throw new TRPCError({ code: "CONFLICT", message: "Заявка уже обработана и не может быть одобрена повторно." });
          }
          if (error instanceof Error && error.message === "APPLICATION_ALREADY_APPROVED") {
            throw new TRPCError({ code: "CONFLICT", message: "Заявка уже одобрена с другим владельцем." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось одобрить заявку и создать заведение." });
        }
      }),
    setStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["rejected", "suspended", "pending"]) }))
      .mutation(async ({ input }) => {
        try {
          return await updateRestaurantApplicationStatus(input.id, input.status);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось изменить статус заявки." });
        }
      }),
  }),

  restaurants: router({
    listPublic: publicProcedure.query(async () => {
      try {
        return await listPublicRestaurants();
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось загрузить заведения." });
      }
    }),
    search: publicProcedure.input(z.object({ query: z.string().trim().max(120) })).query(async ({ input }) => {
      try {
        return await searchPublicCatalog(input.query);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось выполнить поиск каталога." });
      }
    }),
    menu: publicProcedure.input(z.object({ restaurantId: z.number().int().positive() })).query(async ({ input }) => {
      try {
        return await getPublicRestaurantMenu(input.restaurantId);
      } catch (error) {
        if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Заведение не найдено." });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось загрузить меню." });
      }
    }),
  }),

  customerOrders: router({
    list: protectedProcedure.query(async ({ ctx }) => listCustomerOrders(ctx.user.id)),
    tracking: protectedProcedure.input(z.object({ orderId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      try { return await getCustomerOrderTracking(ctx.user.id, input.orderId); }
      catch { throw new TRPCError({ code: "NOT_FOUND", message: "Заказ для отслеживания не найден." }); }
    }),
    create: protectedProcedure
      .input(z.object({ restaurantId: z.number().int().positive(), items: z.array(z.object({ menuItemId: z.number().int().positive(), quantity: z.number().int().min(1).max(99) })).min(1).max(50), fulfillment: z.enum(["delivery", "pickup"]), idempotencyKey: z.string().uuid(), address: z.string().trim().min(5).max(400), contactPhone: z.string().trim().min(7).max(32).optional(), customerComment: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await createCustomerOrder(ctx.user.id, input);
        } catch (error) {
          if (error instanceof Error && error.message === "RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Заведение больше недоступно." });
          if (error instanceof Error && (error.message === "MENU_ITEMS_UNAVAILABLE" || error.message === "INVALID_ORDER_ITEMS")) throw new TRPCError({ code: "BAD_REQUEST", message: "Некоторые блюда недоступны. Обновите меню и попробуйте снова." });
          if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "Ключ повторной отправки уже связан с другим пользователем." });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось оформить заказ." });
        }
      }),
  }),

  push: router({
    register: protectedProcedure.input(z.object({ token: z.string().trim().min(10).max(512), platform: z.enum(["ios", "android", "web"]) })).mutation(async ({ ctx, input }) => {
      try { return await registerPushToken(ctx.user.id, input.token, input.platform); }
      catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось включить push-уведомления." }); }
    }),
    unregister: protectedProcedure.input(z.object({ token: z.string().trim().min(10).max(512) })).mutation(async ({ ctx, input }) => {
      try { return await deactivatePushToken(ctx.user.id, input.token); }
      catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось отключить push-уведомления." }); }
    }),
  }),

  driver: router({
    profile: protectedProcedure.query(async ({ ctx }) => {
      try { return await getDriverProfile(ctx.user.id); }
      catch { throw new TRPCError({ code: "NOT_FOUND", message: "Профиль курьера не найден." }); }
    }),
    register: protectedProcedure.input(z.object({ displayName: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(32), vehicle: z.string().trim().max(120).optional() })).mutation(({ ctx, input }) => registerDeliveryDriver(ctx.user.id, input)),
    assignments: protectedProcedure.query(async ({ ctx }) => {
      try { return await listDriverAssignments(ctx.user.id); }
      catch { throw new TRPCError({ code: "FORBIDDEN", message: "Профиль курьера не найден." }); }
    }),
    updateStatus: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), status: z.enum(["accepted", "picked_up", "delivered"]) })).mutation(async ({ ctx, input }) => {
      try { return await updateDriverAssignmentStatus(ctx.user.id, input.orderId, input.status); }
      catch (error) { if (error instanceof Error && error.message === "INVALID_DRIVER_TRANSITION") throw new TRPCError({ code: "CONFLICT", message: "Этот статус курьера сейчас недоступен." }); throw new TRPCError({ code: "FORBIDDEN", message: "Заказ не назначен этому курьеру." }); }
    }),
    location: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), latitudeE6: z.number().int().min(-90000000).max(90000000), longitudeE6: z.number().int().min(-180000000).max(180000000), accuracyCm: z.number().int().min(0).max(100000).optional() })).mutation(async ({ ctx, input }) => {
      try { return await updateDriverLocation(ctx.user.id, input); }
      catch { throw new TRPCError({ code: "FORBIDDEN", message: "Нет активной доставки для передачи координат." }); }
    }),
  }),

  restaurantOwner: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await getRestaurantOwnerDashboard(ctx.user.id);
      } catch (error) {
        if (error instanceof Error && error.message === "OWNER_RESTAURANT_NOT_FOUND") {
          throw new TRPCError({ code: "FORBIDDEN", message: "У вас нет одобренного заведения владельца." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось загрузить кабинет заведения." });
      }
    }),
    drivers: protectedProcedure.query(async ({ ctx }) => {
      try { return await listOwnerDrivers(ctx.user.id); }
      catch { throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к курьерам заведения." }); }
    }),
    assignDriver: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), driverId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { return await assignDriverToOrder(ctx.user.id, input.orderId, input.driverId); }
      catch (error) { if (error instanceof Error && error.message === "ORDER_NOT_READY") throw new TRPCError({ code: "CONFLICT", message: "Курьера можно назначить только на готовый заказ." }); if (error instanceof Error && error.message === "DRIVER_NOT_AVAILABLE") throw new TRPCError({ code: "BAD_REQUEST", message: "Курьер недоступен." }); if (error instanceof Error && error.message === "DRIVER_ALREADY_ASSIGNED") throw new TRPCError({ code: "CONFLICT", message: "К этому заказу уже привязан курьер." }); throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к заказу или заведению." }); }
    }),
    orders: protectedProcedure.query(async ({ ctx }) => {
      try { return await listOwnerOrders(ctx.user.id); }
      catch (error) { if (error instanceof Error && error.message === "OWNER_RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к заказам заведения." }); throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось загрузить заказы." }); }
    }),
    notifications: protectedProcedure.query(async ({ ctx }) => {
      try { return await listOwnerNotifications(ctx.user.id); }
      catch (error) { if (error instanceof Error && error.message === "OWNER_RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к уведомлениям заведения." }); throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось загрузить уведомления." }); }
    }),
    markNotificationRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try { return await markOwnerNotificationRead(ctx.user.id, input.notificationId); }
      catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось отметить уведомление." }); }
    }),
    updateOrderStatus: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), status: z.enum(["restaurant_confirmed", "restaurant_rejected", "preparing", "ready", "courier_assigned", "handed_to_courier", "in_transit", "delivered", "completed"]), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      try { return await updateOwnerOrderStatus(ctx.user.id, input.orderId, input.status, input.reason); }
      catch (error) { if (error instanceof Error && error.message === "ORDER_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Заказ не найден в вашем заведении." }); if (error instanceof Error && error.message === "INVALID_ORDER_TRANSITION") throw new TRPCError({ code: "CONFLICT", message: "Этот переход статуса сейчас недоступен." }); throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось изменить статус заказа." }); }
    }),
    createCategory: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(120) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await createOwnerMenuCategory(ctx.user.id, input.name);
        } catch (error) {
          if (error instanceof Error && error.message === "OWNER_RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к одобренному заведению." });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось создать категорию." });
        }
      }),
    createItem: protectedProcedure
      .input(z.object({ categoryId: z.number().int().positive(), name: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).optional(), priceKopecks: z.number().int().positive().max(100000000), prepMinutes: z.number().int().min(1).max(1440) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await createOwnerMenuItem(ctx.user.id, input);
        } catch (error) {
          if (error instanceof Error && error.message === "OWNER_RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к одобренному заведению." });
          if (error instanceof Error && error.message === "MENU_CATEGORY_NOT_FOUND") throw new TRPCError({ code: "BAD_REQUEST", message: "Категория не принадлежит вашему заведению." });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось создать блюдо." });
        }
      }),
    setAvailability: protectedProcedure
      .input(z.object({ itemId: z.number().int().positive(), available: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await setOwnerMenuItemAvailability(ctx.user.id, input.itemId, input.available);
        } catch (error) {
          if (error instanceof Error && error.message === "OWNER_RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к одобренному заведению." });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось изменить доступность блюда." });
        }
      }),
    upsertHours: protectedProcedure
      .input(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), isClosed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await upsertOwnerHours(ctx.user.id, input);
        } catch (error) {
          if (error instanceof Error && error.message === "OWNER_RESTAURANT_NOT_FOUND") throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа к одобренному заведению." });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось сохранить график." });
        }
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;

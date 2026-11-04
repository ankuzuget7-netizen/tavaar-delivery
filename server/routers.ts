import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { createRestaurantApplication, listRestaurantApplications, updateRestaurantApplicationStatus } from "./db";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
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
      .mutation(async ({ input }) => {
        try {
          return await createRestaurantApplication(input);
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
    setStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["approved", "rejected", "suspended"]) }))
      .mutation(async ({ input }) => {
        try {
          return await updateRestaurantApplicationStatus(input.id, input.status);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось изменить статус заявки." });
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

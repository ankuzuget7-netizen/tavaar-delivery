import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { clearLegacySessionCookie } from "./cookies";
import { attachRealtime } from "./realtime";
import { parseBotStart, type PhoneChannel } from "./bots";
import { deliverBotCode, handleBotStart } from "../phone-auth";

async function startServer() {
  const app = express();
  const server = createServer(app);
  attachRealtime(server);

  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  const botWebhook = (channel: PhoneChannel) => async (req: express.Request, res: express.Response) => {
    const expected = channel === "telegram" ? process.env.TG_BOT_WEBHOOK_SECRET : process.env.MAX_BOT_WEBHOOK_SECRET;
    const headerName = channel === "telegram" ? "x-telegram-bot-api-secret-token" : "x-max-bot-api-secret";
    if (expected && req.header(headerName) !== expected) {
      res.status(401).json({ ok: false });
      return;
    }
    try {
      const start = parseBotStart(channel, req.body);
      if (start) await deliverBotCode(await handleBotStart(channel, start.state, start.userId, start.chatId));
    } catch (error) {
      if (error instanceof Error && error.message === "BOT_DELIVERY_FAILED") {
        res.status(503).json({ ok: false });
        return;
      }
      // Invalid or expired states are acknowledged so providers do not retry them.
    }
    res.json({ ok: true });
  };
  app.post("/api/bots/telegram/webhook", botWebhook("telegram"));
  app.post("/api/bots/max/webhook", botWebhook("max"));

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // The production container builds Expo Web into web-dist. Keep API routes above
  // this handler so browser navigation cannot turn an API error into HTML.
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web-dist");
  app.use(express.static(webRoot, { index: "index.html" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    if (!req.accepts("html")) return next();
    res.sendFile(path.join(webRoot, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    console.error("[API] unhandled request error", {
      method: req.method,
      path: req.path,
      errorCode: error instanceof Error ? error.message : "UNKNOWN",
    });
    res.status(500).json({ error: { message: "Internal server error" } });
  });

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

startServer().catch(() => {
  console.error("[api] server failed to start");
});

import type { IncomingMessage, Server } from "http";
import type { Request } from "express";
import { WebSocketServer, WebSocket } from "ws";

import { sdk } from "./sdk";

const connections = new Map<number, Set<WebSocket>>();
let wss: WebSocketServer | null = null;

export function attachRealtime(server: Server) {
  wss = new WebSocketServer({ server, path: "/api/ws" });
  wss.on("connection", async (socket, request) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const token = url.searchParams.get("token");
      const authRequest = request as IncomingMessage & { headers: Record<string, string | string[] | undefined> };
      if (token) authRequest.headers.authorization = `Bearer ${token}`;
      const user = await sdk.authenticateRequest(authRequest as Request);
      const userSockets = connections.get(user.id) ?? new Set<WebSocket>();
      userSockets.add(socket);
      connections.set(user.id, userSockets);
      socket.send(JSON.stringify({ type: "connected", userId: user.id }));
      socket.on("close", () => {
        userSockets.delete(socket);
        if (userSockets.size === 0) connections.delete(user.id);
      });
      socket.on("error", () => {
        userSockets.delete(socket);
      });
    } catch {
      socket.close(1008, "Unauthorized");
    }
  });
  return wss;
}

export function broadcastToUser(userId: number, event: { type: string; orderId?: number; status?: string; notificationId?: number }) {
  const sockets = connections.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

export async function sendExpoPushNotifications(tokens: string[], message: { title: string; body: string; data?: Record<string, unknown> }) {
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({ to, sound: "default", channelId: "orders", title: message.title, body: message.body, data: message.data ?? {} }));
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(messages) });
    if (!response.ok) console.warn(`[push] Expo returned ${response.status}`);
  } catch (error) {
    console.warn("[push] delivery failed", error);
  }
}

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

function getWebSocketUrl(token: string | null) {
  let base = getApiBaseUrl();
  if (!base && typeof window !== "undefined") base = window.location.origin;
  if (!base) return null;
  const websocketBase = base.replace(/^http/, "ws");
  return `${websocketBase}/api/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export function RealtimeBridge() {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const registerPush = trpc.push.register.useMutation();

  useEffect(() => {
    if (!me.data) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const refreshOrderQueries = () => {
      void utils.customerOrders.list.invalidate();
      void utils.restaurantOwner.orders.invalidate();
      void utils.restaurantOwner.notifications.invalidate();
    };

    const connect = async () => {
      if (cancelled) return;
      const token = await Auth.getSessionToken();
      const url = getWebSocketUrl(token);
      if (!url) return;
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as { type?: string };
          if (message.type === "order.created" || message.type === "order.status_changed") refreshOrderQueries();
        } catch {
          // Ignore malformed events; durable queries remain authoritative.
        }
      };
      socket.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(() => void connect(), 5000);
      };
      socket.onerror = () => socket?.close();
    };

    void connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [me.data, utils]);

  useEffect(() => {
    if (!me.data || Platform.OS === "web") return;
    let cancelled = false;
    const register = async () => {
      const permissions = await Notifications.getPermissionsAsync();
      let finalStatus = permissions.status;
      if (finalStatus !== "granted") finalStatus = (await Notifications.requestPermissionsAsync()).status;
      if (finalStatus !== "granted" || cancelled) return;
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("orders", { name: "Заказы", importance: Notifications.AndroidImportance.HIGH, sound: "default" });
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        if (!cancelled) await registerPush.mutateAsync({ token: token.data, platform: Platform.OS === "ios" ? "ios" : "android" });
      } catch {
        // Push is optional; in-app notifications and WebSockets continue to work.
      }
    };
    void register();
    return () => { cancelled = true; };
  }, [me.data, registerPush]);

  return null;
}

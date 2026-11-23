import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = { placed: "Ожидает подтверждения", restaurant_confirmed: "Принят рестораном", preparing: "Готовится", ready: "Готов", courier_assigned: "Курьер назначен", handed_to_courier: "Передан курьеру", in_transit: "В пути", delivered: "Доставлен", completed: "Завершён", restaurant_rejected: "Отклонён рестораном", cancelled: "Отменён" };
const statusColors: Record<string, "warning" | "success" | "error"> = { placed: "warning", restaurant_confirmed: "success", preparing: "warning", ready: "success", restaurant_rejected: "error", cancelled: "error" };
const formatPrice = (kopecks: number) => `${(kopecks / 100).toFixed(2).replace(".", ",")} ₽`;
type OwnerStatus = "restaurant_confirmed" | "restaurant_rejected" | "preparing" | "ready" | "handed_to_courier" | "completed";

function callNumber(value?: string | null) {
  const phone = value?.trim();
  if (!phone) return;
  void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => undefined);
}

export default function PartnerOrdersScreen() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery();
  const isSignedIn = Boolean(me.data);
  const orders = trpc.restaurantOwner.orders.useQuery(undefined, { enabled: isSignedIn, refetchInterval: 15_000 });
  const notifications = trpc.restaurantOwner.notifications.useQuery(undefined, { enabled: isSignedIn, refetchInterval: 15_000 });
  const drivers = trpc.restaurantOwner.drivers.useQuery(undefined, { enabled: isSignedIn, refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const refreshOps = () => { void utils.restaurantOwner.orders.invalidate(); void utils.restaurantOwner.notifications.invalidate(); void utils.restaurantOwner.drivers.invalidate(); };
  const updateStatus = trpc.restaurantOwner.updateOrderStatus.useMutation({ onSuccess: refreshOps });
  const assignDriver = trpc.restaurantOwner.assignDriver.useMutation({ onSuccess: refreshOps });
  const transferDriver = trpc.restaurantOwner.transferDriver.useMutation({ onSuccess: refreshOps });
  const markRead = trpc.restaurantOwner.markNotificationRead.useMutation({ onSuccess: () => void utils.restaurantOwner.notifications.invalidate() });
  const [tab, setTab] = useState<"orders" | "notifications">("orders");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  if (me.isLoading) return <Loading colors={colors} text="Проверяем доступ…" />;
  if (!isSignedIn) return <Locked colors={colors} />;
  if (orders.isLoading) return <Loading colors={colors} text="Загружаем заказы…" />;
  if (orders.isError) return <Locked colors={colors} title="Нет доступа к заказам" body={orders.error.message} />;

  const actionError = updateStatus.error?.message ?? assignDriver.error?.message ?? transferDriver.error?.message;
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>ОПЕРАЦИИ ЗАВЕДЕНИЯ</Text><Text style={[styles.title, { color: colors.foreground }]}>Заказы и уведомления</Text>
    <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable onPress={() => setTab("orders")} style={[styles.tab, tab === "orders" && { backgroundColor: colors.primary }]}><Text style={[styles.tabText, { color: tab === "orders" ? "#FFF8F1" : colors.foreground }]}>Заказы · {orders.data?.length ?? 0}</Text></Pressable>
      <Pressable onPress={() => setTab("notifications")} style={[styles.tab, tab === "notifications" && { backgroundColor: colors.primary }]}><Text style={[styles.tabText, { color: tab === "notifications" ? "#FFF8F1" : colors.foreground }]}>Уведомления · {notifications.data?.filter((item) => !item.readAt).length ?? 0}</Text></Pressable>
    </View>
    {tab === "orders" ? <>
      {actionError ? <Text style={[styles.error, { color: colors.error }]}>{actionError}</Text> : null}
      {drivers.isError ? <Text style={[styles.error, { color: colors.error }]}>{drivers.error.message}</Text> : null}
      <DriverPicker drivers={drivers.data ?? []} selectedDriverId={selectedDriverId} onSelect={setSelectedDriverId} colors={colors} />
      {orders.data?.length ? orders.data.map((order) => <OrderCard key={order.id} order={order} colors={colors} disabled={updateStatus.isPending || assignDriver.isPending || transferDriver.isPending} selectedDriverId={selectedDriverId} onAssign={(driverId) => assignDriver.mutate({ orderId: order.id, driverId })} onTransfer={(driverId) => transferDriver.mutate({ orderId: order.id, driverId })} onStatus={(status) => updateStatus.mutate({ orderId: order.id, status })} />) : <Empty colors={colors} title="Новых заказов пока нет" body="Когда клиент оформит заказ, он появится здесь с серверным итогом и составом." />}
    </> : notifications.isLoading ? <Text style={[styles.loading, { color: colors.muted }]}>Загружаем уведомления…</Text> : notifications.isError ? <Text style={[styles.error, { color: colors.error }]}>{notifications.error.message}</Text> : notifications.data?.length ? notifications.data.map((notification) => <Pressable key={notification.id} onPress={() => !notification.readAt && markRead.mutate({ notificationId: notification.id })} style={[styles.notification, { backgroundColor: colors.surface, borderColor: colors.border, opacity: notification.readAt ? 0.65 : 1 }]}><View style={[styles.notificationIcon, { backgroundColor: colors.primary + "16" }]}><Ionicons name={notification.type === "new_order" ? "receipt-outline" : "notifications-outline"} size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.notificationTitle, { color: colors.foreground }]}>{notification.title}</Text><Text style={[styles.notificationBody, { color: colors.muted }]}>{notification.body}</Text></View>{!notification.readAt ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}</Pressable>) : <Empty colors={colors} title="Уведомлений нет" body="Новые заказы и изменения статусов появятся здесь." />}
  </ScrollView></ScreenContainer>;
}

function DriverPicker({ drivers, selectedDriverId, onSelect, colors }: { drivers: any[]; selectedDriverId: number | null; onSelect: (id: number) => void; colors: ReturnType<typeof useColors> }) {
  if (!drivers.length) return <View style={[styles.driverPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.driverPanelTitle, { color: colors.foreground }]}>Нет доступных курьеров</Text><Text style={[styles.helper, { color: colors.muted }]}>Добавьте зарегистрированного курьера в разделе «Команда» и попросите его выйти в сеть.</Text></View>;
  return <View style={styles.driverPanel}><Text style={[styles.driverPanelTitle, { color: colors.foreground }]}>Доступные курьеры</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.driverRow}>{drivers.map((driver) => <Pressable key={driver.id} onPress={() => onSelect(driver.id)} style={[styles.driverChip, { backgroundColor: selectedDriverId === driver.id ? colors.primary : colors.surface, borderColor: selectedDriverId === driver.id ? colors.primary : colors.border }]}><Text style={[styles.driverChipText, { color: selectedDriverId === driver.id ? "#FFF8F1" : colors.foreground }]}>{driver.displayName} · {driver.phone}</Text></Pressable>)}</ScrollView></View>;
}

function ContactButton({ title, phone, colors }: { title: string; phone?: string | null; colors: ReturnType<typeof useColors> }) {
  if (!phone) return null;
  return <Pressable onPress={() => callNumber(phone)} style={[styles.contactButton, { borderColor: colors.border }]}><Ionicons name="call-outline" size={17} color={colors.primary} /><Text style={[styles.contactText, { color: colors.primary }]}>{title} · {phone}</Text></Pressable>;
}

function OrderCard({ order, colors, disabled, selectedDriverId, onAssign, onTransfer, onStatus }: { order: any; colors: ReturnType<typeof useColors>; disabled: boolean; selectedDriverId: number | null; onAssign: (driverId: number) => void; onTransfer: (driverId: number) => void; onStatus: (status: OwnerStatus) => void }) {
  const ownerNext: Record<string, { label: string; status: OwnerStatus } | undefined> = {
    placed: { label: "Принять заказ", status: "restaurant_confirmed" },
    restaurant_confirmed: { label: "Начать готовить", status: "preparing" },
    preparing: { label: "Отметить готовым", status: "ready" },
    delivered: { label: "Завершить заказ", status: "completed" },
  };
  const assignment = order.activeAssignment;
  const assignmentStatus = assignment?.assignment.status;
  const canTransfer = order.status === "courier_assigned" && ["assigned", "accepted"].includes(assignmentStatus);
  const canHandoff = order.status === "courier_assigned" && assignmentStatus === "accepted";
  const colorName = statusColors[order.status] ?? "warning";
  const badgeColor = colorName === "success" ? colors.success : colorName === "error" ? colors.error : colors.warning;
  return <View style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.orderHeader}><View style={{ flex: 1 }}><Text style={[styles.orderTitle, { color: colors.foreground }]}>Заказ #{order.id}</Text><Text style={[styles.orderMeta, { color: colors.muted }]}>{order.fulfillment === "delivery" ? "Доставка" : "Самовывоз"} · {new Date(order.createdAt).toLocaleString("ru-RU")}</Text></View><View style={[styles.badge, { backgroundColor: badgeColor + "18" }]}><Text style={[styles.badgeText, { color: badgeColor }]}>{statusLabels[order.status] ?? order.status}</Text></View></View>
    {order.items.map((item: any) => <Text key={item.id} style={[styles.line, { color: colors.foreground }]}>{item.quantity} × {item.nameSnapshot} · {formatPrice(item.lineTotalKopecks)}</Text>)}
    <Text style={[styles.total, { color: colors.foreground }]}>Итого: {formatPrice(order.totalKopecks)}</Text><Text style={[styles.address, { color: colors.muted }]}>{order.address}</Text>
    <ContactButton title="Позвонить клиенту" phone={order.contactPhone} colors={colors} />
    {assignment ? <><Text style={[styles.driverInfo, { color: colors.foreground }]}>Курьер: {assignment.driver.displayName} · {assignment.assignment.status === "accepted" ? "принял заказ" : assignment.assignment.status === "picked_up" ? "забрал заказ" : "ожидает ответа"}</Text><ContactButton title="Позвонить курьеру" phone={assignment.driver.phone} colors={colors} /></> : null}
    {order.status === "ready" && order.fulfillment === "delivery" ? selectedDriverId ? <Pressable disabled={disabled} onPress={() => onAssign(selectedDriverId)} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>{disabled ? "Обновляем…" : "Назначить выбранного курьера"}</Text></Pressable> : <Text style={[styles.assignHint, { color: colors.muted }]}>Выберите доступного курьера выше</Text> : null}
    {canHandoff ? <Pressable disabled={disabled} onPress={() => onStatus("handed_to_courier")} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>{disabled ? "Обновляем…" : "Передать заказ курьеру"}</Text></Pressable> : null}
    {order.status === "courier_assigned" && assignmentStatus === "assigned" ? <Text style={[styles.assignHint, { color: colors.warning }]}>Ожидается, пока курьер примет доставку.</Text> : null}
    {canTransfer ? selectedDriverId && selectedDriverId !== assignment.driver.id ? <Pressable disabled={disabled} onPress={() => onTransfer(selectedDriverId)} style={[styles.secondaryButton, { borderColor: colors.primary }]}><Text style={[styles.secondaryText, { color: colors.primary }]}>{disabled ? "Передаём…" : "Передать другому курьеру"}</Text></Pressable> : <Text style={[styles.assignHint, { color: colors.muted }]}>Чтобы переназначить, выберите другого доступного курьера выше.</Text> : null}
    {ownerNext[order.status] ? <View style={styles.actions}><Pressable disabled={disabled} onPress={() => onStatus(ownerNext[order.status]!.status)} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>{disabled ? "Обновляем…" : ownerNext[order.status]!.label}</Text></Pressable>{order.status === "placed" ? <Pressable disabled={disabled} onPress={() => onStatus("restaurant_rejected")} style={[styles.rejectButton, { borderColor: colors.error }]}><Text style={[styles.rejectText, { color: colors.error }]}>Отклонить</Text></Pressable> : null}</View> : null}
  </View>;
}

function Loading({ colors, text }: { colors: ReturnType<typeof useColors>; text: string }) { return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.loading, { color: colors.muted }]}>{text}</Text></ScreenContainer>; }
function Empty({ colors, title, body }: { colors: ReturnType<typeof useColors>; title: string; body: string }) { return <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="file-tray-outline" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text></View>; }
function Locked({ colors, title = "Войдите, чтобы открыть кабинет", body = "Заказы и уведомления защищены серверной авторизацией заведения." }: { colors: ReturnType<typeof useColors>; title?: string; body?: string }) { return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><View style={styles.locked}><View style={[styles.lockIcon, { backgroundColor: colors.warning + "18" }]}><Ionicons name="lock-closed-outline" size={30} color={colors.warning} /></View><Text style={[styles.lockTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.lockBody, { color: colors.muted }]}>{body}</Text><Pressable onPress={() => router.back()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>Вернуться назад</Text></Pressable></View></ScreenContainer>; }

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 35, gap: 13 }, back: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 }, backText: { fontSize: 14, fontWeight: "700" }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 28, fontWeight: "800" }, tabs: { borderWidth: 1, borderRadius: 14, padding: 4, flexDirection: "row", marginTop: 5 }, tab: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" }, tabText: { fontSize: 12, fontWeight: "800" }, driverPanel: { gap: 7, borderWidth: 1, borderRadius: 14, padding: 12 }, driverPanelTitle: { fontSize: 13, fontWeight: "800" }, driverRow: { gap: 8 }, driverChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" }, driverChipText: { fontSize: 11, fontWeight: "800" }, helper: { fontSize: 12, lineHeight: 18 }, orderCard: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 8 }, orderHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 }, orderTitle: { fontSize: 17, fontWeight: "800" }, orderMeta: { fontSize: 11, marginTop: 3 }, badge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 150 }, badgeText: { fontSize: 10, fontWeight: "800" }, line: { fontSize: 13 }, total: { fontSize: 15, fontWeight: "800", marginTop: 4 }, address: { fontSize: 12, lineHeight: 17 }, contactButton: { minHeight: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 6 }, contactText: { fontSize: 11, fontWeight: "700" }, driverInfo: { fontSize: 12, fontWeight: "700" }, actions: { flexDirection: "row", gap: 8, marginTop: 5 }, primaryButton: { minHeight: 44, flex: 1, borderRadius: 12, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFF8F1", fontSize: 13, fontWeight: "800" }, secondaryButton: { minHeight: 42, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, secondaryText: { fontSize: 12, fontWeight: "800" }, rejectButton: { minHeight: 44, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, rejectText: { fontSize: 13, fontWeight: "800" }, assignHint: { fontSize: 12, fontWeight: "700", paddingVertical: 8 }, error: { fontSize: 12, lineHeight: 18 }, notification: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, notificationIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, notificationTitle: { fontSize: 14, fontWeight: "800" }, notificationBody: { fontSize: 12, lineHeight: 17, marginTop: 3 }, dot: { width: 8, height: 8, borderRadius: 4 }, empty: { borderWidth: 1, borderRadius: 20, padding: 28, alignItems: "center", gap: 8 }, emptyTitle: { fontSize: 17, fontWeight: "800" }, emptyBody: { fontSize: 13, lineHeight: 19, textAlign: "center" }, loading: { textAlign: "center", marginTop: 30 }, locked: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30, gap: 12 }, lockIcon: { width: 76, height: 76, borderRadius: 26, alignItems: "center", justifyContent: "center" }, lockTitle: { fontSize: 23, fontWeight: "800", textAlign: "center" }, lockBody: { fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 330 } });

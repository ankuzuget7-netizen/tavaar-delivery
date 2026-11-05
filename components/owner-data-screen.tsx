import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Section = "users" | "orders" | "restaurants" | "audit";
export function OwnerDataScreen({ section }: { section: Section }) {
  const colors = useColors();
  const me = trpc.auth.me.useQuery();
  const users = trpc.ownerAdmin.users.useQuery(undefined, { enabled: section === "users" && me.data?.role === "super_admin" });
  const orders = trpc.ownerAdmin.orders.useQuery(undefined, { enabled: section === "orders" && me.data?.role === "super_admin" });
  const restaurants = trpc.ownerAdmin.restaurants.useQuery(undefined, { enabled: section === "restaurants" && me.data?.role === "super_admin" });
  const audit = trpc.ownerAdmin.auditLogs.useQuery(undefined, { enabled: section === "audit" && me.data?.role === "super_admin" });
  const query = section === "users" ? users : section === "orders" ? orders : section === "restaurants" ? restaurants : audit;
  if (me.isLoading || query.isLoading) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.center, { color: colors.muted }]}>Загружаем данные…</Text></ScreenContainer>;
  if (me.data?.role !== "super_admin") return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.center, { color: colors.error }]}>Доступ только для Super Admin.</Text></ScreenContainer>;
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}><Text onPress={() => router.back()} style={[styles.back, { color: colors.primary }]}>← Назад в панель</Text><Text style={[styles.title, { color: colors.foreground }]}>{titles[section]}</Text>{query.isError ? <Text style={[styles.error, { color: colors.error }]}>Не удалось загрузить реальные данные.</Text> : <View style={styles.list}>{section === "users" ? (users.data ?? []).map((item) => <Row key={item.id} title={`${item.name || "Без имени"} · #${item.id}`} body={`${item.email || item.phone || "Контакт не указан"} · роль: ${item.role}`} colors={colors} />) : section === "orders" ? (orders.data ?? []).map((item) => <Row key={item.id} title={`Заказ #${item.id} · ${item.restaurantName}`} body={`${item.status} · ${item.customerName || "Клиент"} · ${item.totalKopecks} коп.`} colors={colors} />) : section === "restaurants" ? (restaurants.data ?? []).map((item) => <Row key={item.id} title={`${item.name} · #${item.id}`} body={`${item.status} · ${item.type} · ${item.address}`} colors={colors} />) : (audit.data ?? []).map((item) => <Row key={item.id} title={`${item.action} · ${item.entityType}${item.entityId ? ` #${item.entityId}` : ""}`} body={`${item.actorName || item.actorEmail || "Владелец"} · ${new Date(item.createdAt).toLocaleString("ru-RU")}`} colors={colors} />)}{((section === "users" ? users.data : section === "orders" ? orders.data : section === "restaurants" ? restaurants.data : audit.data) ?? []).length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Записей пока нет.</Text> : null}</View>}</ScrollView></ScreenContainer>;
}
function Row({ title, body, colors }: { title: string; body: string; colors: ReturnType<typeof useColors> }) { return <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.rowBody, { color: colors.muted }]}>{body}</Text></View>; }
const titles: Record<Section, string> = { users: "Пользователи", orders: "Все заказы", restaurants: "Заведения", audit: "Журнал аудита" };
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 24, gap: 12, maxWidth: 920, width: "100%", alignSelf: "center" }, center: { textAlign: "center", marginTop: 40 }, back: { fontSize: 14, fontWeight: "800", marginBottom: 8 }, title: { fontSize: 31, fontWeight: "900", marginBottom: 6 }, list: { gap: 9 }, row: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 }, rowTitle: { fontSize: 15, fontWeight: "900" }, rowBody: { fontSize: 12, lineHeight: 18 }, error: { fontSize: 13 }, empty: { textAlign: "center", padding: 24 } });

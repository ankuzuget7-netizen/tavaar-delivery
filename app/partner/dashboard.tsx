import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const sections = [
  ["restaurant-outline", "Моё заведение", "Профиль, график и условия обслуживания"],
  ["list-outline", "Меню", "Категории, блюда, цены и доступность"],
  ["receipt-outline", "Заказы", "Новые заказы и статусы приготовления"],
  ["bar-chart-outline", "Статистика", "Заказы, выручка и расчёты"],
] as const;

export default function PartnerDashboardScreen() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery();
  const isSignedIn = Boolean(me.data);

  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable><Text style={[styles.eyebrow, { color: colors.primary }]}>КАБИНЕТ ПАРТНЁРА</Text><Text style={[styles.title, { color: colors.foreground }]}>Заведение</Text><View style={[styles.accessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.accessIcon, { backgroundColor: colors.warning + "18" }]}><Ionicons name={isSignedIn ? "time-outline" : "lock-closed-outline"} size={25} color={colors.warning} /></View><View style={{ flex: 1 }}><Text style={[styles.accessTitle, { color: colors.foreground }]}>{isSignedIn ? "Проверка доступа к заведению" : "Войдите, чтобы открыть кабинет"}</Text><Text style={[styles.accessBody, { color: colors.muted }]}>{isSignedIn ? "Свяжите аккаунт с одобренной заявкой администратора. До этого меню и заказы недоступны." : "Кабинет защищён серверной авторизацией. Публичная форма заявки не выдаёт права владельца."}</Text></View></View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Разделы кабинета</Text>{sections.map(([icon, title, body]) => <View key={title} style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, opacity: isSignedIn ? 1 : 0.58 }]}><View style={[styles.sectionIcon, { backgroundColor: colors.primary + "14" }]}><Ionicons name={icon} size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.sectionName, { color: colors.foreground }]}>{title}</Text><Text style={[styles.sectionBody, { color: colors.muted }]}>{body}</Text></View><Ionicons name="lock-closed-outline" size={16} color={colors.muted} /></View>)}<Pressable onPress={() => router.push("/partner/apply")} style={[styles.button, { borderColor: colors.primary }]}><Ionicons name="add-circle-outline" size={19} color={colors.primary} /><Text style={[styles.buttonText, { color: colors.primary }]}>Подать заявку на подключение</Text></Pressable></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 35, gap: 13 }, back: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }, backText: { fontSize: 14, fontWeight: "700" }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 30, fontWeight: "800" }, accessCard: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 5 }, accessIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, accessTitle: { fontSize: 15, fontWeight: "800" }, accessBody: { fontSize: 12, lineHeight: 18, marginTop: 4 }, sectionTitle: { fontSize: 19, fontWeight: "800", marginTop: 8 }, section: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }, sectionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, sectionName: { fontSize: 15, fontWeight: "800" }, sectionBody: { fontSize: 12, lineHeight: 17, marginTop: 3 }, button: { minHeight: 50, borderRadius: 15, borderWidth: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }, buttonText: { fontSize: 14, fontWeight: "800" } });

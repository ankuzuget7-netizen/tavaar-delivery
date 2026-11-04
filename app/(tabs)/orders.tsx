import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

export default function OrdersScreen() {
  const colors = useColors();
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}><Text style={[styles.eyebrow, { color: colors.primary }]}>ИСТОРИЯ</Text><Text style={[styles.title, { color: colors.foreground }]}>Мои заказы</Text><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.icon, { backgroundColor: colors.primary + "16" }]}><Ionicons name="receipt-outline" size={28} color={colors.primary} /></View><Text style={[styles.cardTitle, { color: colors.foreground }]}>Заказов пока нет</Text><Text style={[styles.body, { color: colors.muted }]}>Когда вы оформите первый заказ, его статус и история появятся здесь.</Text></View></ScrollView></ScreenContainer>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, gap: 8 }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 8 }, title: { fontSize: 30, fontWeight: "800", marginBottom: 20 }, card: { borderWidth: 1, borderRadius: 24, padding: 28, alignItems: "center" }, icon: { width: 62, height: 62, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 14 }, cardTitle: { fontSize: 18, fontWeight: "800" }, body: { textAlign: "center", fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 280 } });

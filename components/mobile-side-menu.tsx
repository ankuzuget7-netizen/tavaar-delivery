import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { router } from "expo-router";

export function MobileSideMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const go = (path: string) => { onClose(); router.push(path as never); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: colors.surface }]}>
        <View style={styles.panelHeader}><View><Text style={[styles.kicker, { color: colors.primary }]}>ТАВААР ДОСТАВКА</Text><Text style={[styles.title, { color: colors.foreground }]}>Ещё</Text></View><Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}><Ionicons name="close" size={20} color={colors.foreground} /></Pressable></View>
        <Text style={[styles.section, { color: colors.muted }]}>О сервисе</Text>
        <Pressable onPress={() => go("/partner/apply")} style={[styles.menuItem, { borderColor: colors.border }]}><View style={[styles.iconWell, { backgroundColor: colors.primary + "14" }]}><Ionicons name="storefront-outline" size={21} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>Стать партнёром</Text><Text style={[styles.itemBody, { color: colors.muted }]}>Подключить ресторан, кафе или точку питания</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Pressable onPress={() => go("/(tabs)/support")} style={[styles.menuItem, { borderColor: colors.border }]}><View style={[styles.iconWell, { backgroundColor: colors.primary + "14" }]}><Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>Поддержка</Text><Text style={[styles.itemBody, { color: colors.muted }]}>Ответы на вопросы и помощь</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Text style={[styles.note, { color: colors.muted }]}>В меню можно быстро перейти к разделу для бизнеса и связаться с поддержкой.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({ overlay: { flex: 1, flexDirection: "row" }, backdrop: { flex: 1, backgroundColor: "#241F1D88" }, panel: { width: "84%", maxWidth: 360, padding: 20, paddingTop: 58, gap: 14, shadowColor: "#241F1D", shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 }, panelHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }, kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1.6 }, title: { fontSize: 32, fontWeight: "900", marginTop: 4 }, close: { width: 40, height: 40, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" }, section: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" }, menuItem: { minHeight: 76, borderWidth: 1, borderRadius: 17, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 }, iconWell: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, itemTitle: { fontSize: 14, fontWeight: "900" }, itemBody: { fontSize: 11, lineHeight: 16, marginTop: 3 }, note: { fontSize: 12, lineHeight: 18, marginTop: 4 } });

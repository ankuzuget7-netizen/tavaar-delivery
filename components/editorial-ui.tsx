import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export function SectionHeading({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  const colors = useColors();
  return <View style={styles.heading}><Text style={[styles.headingTitle, { color: colors.foreground }]}>{title}</Text>{action || (meta ? <Text style={[styles.headingMeta, { color: colors.muted }]}>{meta}</Text> : null)}</View>;
}

export function SurfaceCard({ children, style }: PropsWithChildren<{ style?: object }>) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function EditorialIcon({ name, size = 22, tone = "primary" }: { name: keyof typeof Ionicons.glyphMap; size?: number; tone?: "primary" | "muted" | "success" }) {
  const colors = useColors();
  const color = tone === "muted" ? colors.muted : tone === "success" ? colors.success : colors.primary;
  return <View style={[styles.iconWell, { backgroundColor: `${color}18` }]}><Ionicons name={name} size={size} color={color} /></View>;
}

export function EditorialPill({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const colors = useColors();
  const content = <><>{icon ? <Ionicons name={icon} size={15} color={selected ? "#FFF8F1" : colors.primary} /> : null}</><Text style={[styles.pillText, { color: selected ? "#FFF8F1" : colors.foreground }]}>{label}</Text></>;
  return onPress ? <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border }]}>{content}</Pressable> : <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>{content}</View>;
}

export function EmptyState({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  const colors = useColors();
  return <SurfaceCard style={styles.empty}><EditorialIcon name={icon} size={28} tone="muted" /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text>{action}</SurfaceCard>;
}

export function Price({ kopecks, large = false }: { kopecks: number; large?: boolean }) {
  const colors = useColors();
  return <Text style={[large ? styles.priceLarge : styles.price, { color: colors.primary }]}>{`${(kopecks / 100).toFixed(2).replace(".", ",")} ₽`}</Text>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 14 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 5, marginBottom: 3 },
  headingTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.35 },
  headingMeta: { fontSize: 12, fontWeight: "700" },
  iconWell: { width: 50, height: 50, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pill: { minHeight: 42, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 12, fontWeight: "800" },
  empty: { alignItems: "center", gap: 9, paddingVertical: 26 },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: "center" },
  price: { fontSize: 13, fontWeight: "800" },
  priceLarge: { fontSize: 23, fontWeight: "900" },
});

export const editorialStyles = styles;

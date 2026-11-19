import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export function SectionHeading({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={editorialStyles.heading}>
      <View style={editorialStyles.headingLead}>
        <View style={[editorialStyles.headingMark, { backgroundColor: colors.warning }]} />
        <Text style={[editorialStyles.headingTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {action || (meta ? <Text style={[editorialStyles.headingMeta, { color: colors.muted }]}>{meta}</Text> : null)}
    </View>
  );
}

export function SurfaceCard({ children, style }: PropsWithChildren<{ style?: object }>) {
  const colors = useColors();
  return <View style={[editorialStyles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.primary }, style]}>{children}</View>;
}

export function EditorialIcon({ name, size = 22, tone = "primary" }: { name: keyof typeof Ionicons.glyphMap; size?: number; tone?: "primary" | "muted" | "success" | "warning" }) {
  const colors = useColors();
  const color = tone === "muted" ? colors.muted : tone === "success" ? colors.success : tone === "warning" ? colors.warning : colors.primary;
  return <View style={[editorialStyles.iconWell, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}><Ionicons name={name} size={size} color={color} /></View>;
}

export function EditorialPill({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const colors = useColors();
  const content = <><>{icon ? <Ionicons name={icon} size={15} color={selected ? "#FFF8F1" : colors.primary} /> : null}</><Text style={[editorialStyles.pillText, { color: selected ? "#FFF8F1" : colors.foreground }]}>{label}</Text></>;
  return onPress ? <Pressable onPress={onPress} style={[editorialStyles.pill, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border }]}>{content}</Pressable> : <View style={[editorialStyles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>{content}</View>;
}

export function EmptyState({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  const colors = useColors();
  return <SurfaceCard style={editorialStyles.empty}><EditorialIcon name={icon} size={28} tone="muted" /><Text style={[editorialStyles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[editorialStyles.emptyBody, { color: colors.muted }]}>{body}</Text>{action}</SurfaceCard>;
}

export function Price({ kopecks, large = false }: { kopecks: number; large?: boolean }) {
  const colors = useColors();
  return <Text style={[large ? editorialStyles.priceLarge : editorialStyles.price, { color: colors.primary }]}>{`${(kopecks / 100).toFixed(2).replace(".", ",")} ₽`}</Text>;
}

export const editorialStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 15, shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 7, marginBottom: 5 },
  headingLead: { flexDirection: "row", alignItems: "center", gap: 8 },
  headingMark: { width: 7, height: 22, borderRadius: 5 },
  headingTitle: { fontSize: 21, fontWeight: "900", letterSpacing: -0.45 },
  headingMeta: { fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  iconWell: { width: 48, height: 48, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pill: { minHeight: 42, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 12, fontWeight: "900" },
  empty: { alignItems: "center", gap: 9, paddingVertical: 28 },
  emptyTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  emptyBody: { maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: "center" },
  price: { fontSize: 13, fontWeight: "900" },
  priceLarge: { fontSize: 24, fontWeight: "900" },
});

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const categories = [
  { icon: "restaurant-outline" as const, label: "Рестораны" },
  { icon: "fast-food-outline" as const, label: "Быстро" },
  { icon: "cafe-outline" as const, label: "Кофе" },
  { icon: "ice-cream-outline" as const, label: "Десерты" },
];

export default function HomeScreen() {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const restaurants = trpc.restaurants.listPublic.useQuery();
  const greeting = useMemo(() => (query.trim() ? `Ищем «${query.trim()}»` : "Что вкусного сегодня?"), [query]);

  return (
    <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>АК-ДОВУРАК · ТЫВА</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Доставка рядом</Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>АД</Text>
          </View>
        </View>

        <Pressable style={[styles.address, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button">
          <Ionicons name="location-outline" size={20} color={colors.primary} />
          <View style={styles.addressText}>
            <Text style={[styles.smallLabel, { color: colors.muted }]}>АДРЕС ДОСТАВКИ</Text>
            <Text style={[styles.addressValue, { color: colors.foreground }]}>Ак-Довурак, выбрать адрес</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Ресторан или блюдо"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.foreground }]}
            accessibilityLabel="Поиск ресторана или блюда"
          />
          {query ? <Pressable onPress={() => setQuery("")}><Ionicons name="close-circle" size={19} color={colors.muted} /></Pressable> : null}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{greeting}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((category) => (
            <Pressable key={category.label} style={styles.category} accessibilityRole="button">
              <View style={[styles.categoryIcon, { backgroundColor: colors.primary + "16" }]}>
                <Ionicons name={category.icon} size={22} color={colors.primary} />
              </View>
              <Text style={[styles.categoryLabel, { color: colors.foreground }]}>{category.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>СКОРО ЗДЕСЬ</Text>
            <Text style={styles.heroTitle}>Вкусные места Ак-Довурака</Text>
            <Text style={styles.heroBody}>Мы подключаем проверенные заведения города.</Text>
          </View>
          <View style={styles.heroMark}><Ionicons name="restaurant-outline" size={42} color="#FFF8F1" /></View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Заведения рядом</Text>
          <Text style={[styles.sectionMeta, { color: colors.muted }]}>{restaurants.data?.length ?? 0} заведений</Text>
        </View>
        {restaurants.data && restaurants.data.length > 0 ? restaurants.data.map((restaurant) => (
          <Pressable key={restaurant.id} onPress={() => router.push(`/restaurant/${restaurant.id}` as never)} style={[styles.restaurantCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.restaurantIcon, { backgroundColor: colors.primary + "16" }]}><Ionicons name="restaurant-outline" size={25} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.restaurantName, { color: colors.foreground }]}>{restaurant.name}</Text><Text style={[styles.restaurantMeta, { color: colors.muted }]}>{restaurant.type} · {restaurant.address}</Text><Text style={[styles.restaurantMeta, { color: colors.muted }]}>Проверенное заведение</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )) : <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.warning + "18" }]}>
            <Ionicons name="storefront-outline" size={28} color={colors.warning} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{restaurants.isError ? "Каталог временно недоступен" : "Каталог пока пуст"}</Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>{restaurants.isError ? "Проверьте соединение и попробуйте снова." : "Здесь появятся рестораны после проверки и одобрения заявки."}</Text>
          <Pressable onPress={() => router.push("/partner/apply")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
            <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Подключить заведение</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.primary} />
          </Pressable>
        </View>}

        <View style={styles.footerNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
          <Text style={[styles.footerText, { color: colors.muted }]}>Только проверенные партнёры и честные статусы заказов</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 36, gap: 18 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.7, marginTop: 5 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF8F1", fontSize: 13, fontWeight: "800" },
  address: { minHeight: 64, borderRadius: 18, borderWidth: 1, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  addressText: { flex: 1 },
  smallLabel: { fontSize: 10, letterSpacing: 1, fontWeight: "800", marginBottom: 3 },
  addressValue: { fontSize: 14, fontWeight: "600" },
  search: { height: 52, borderRadius: 17, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, fontSize: 15 },
  sectionTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.3 },
  categoryRow: { gap: 18, paddingRight: 10 },
  category: { alignItems: "center", gap: 7, minWidth: 68 },
  categoryIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  categoryLabel: { fontSize: 12, fontWeight: "600" },
  hero: { minHeight: 148, borderRadius: 24, padding: 20, flexDirection: "row", overflow: "hidden", alignItems: "center" },
  heroCopy: { flex: 1, paddingRight: 10 },
  heroKicker: { color: "#FFD7C8", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  heroTitle: { color: "#FFF8F1", fontSize: 24, fontWeight: "800", lineHeight: 28 },
  heroBody: { color: "#FFE8DE", fontSize: 13, lineHeight: 18, marginTop: 8 },
  heroMark: { width: 76, height: 76, borderRadius: 28, backgroundColor: "#FFFFFF1C", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-10deg" }] },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 },
  sectionMeta: { fontSize: 12, fontWeight: "600" },
  emptyCard: { borderWidth: 1, borderRadius: 24, padding: 24, alignItems: "center" },
  emptyIcon: { width: 62, height: 62, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 13 },
  restaurantCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  restaurantIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  restaurantName: { fontSize: 16, fontWeight: "800" },
  restaurantMeta: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyText: { textAlign: "center", fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 290 },
  outlineButton: { marginTop: 18, borderWidth: 1.5, borderRadius: 14, minHeight: 44, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 8 },
  outlineButtonText: { fontSize: 14, fontWeight: "800" },
  footerNote: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, marginTop: 2 },
  footerText: { fontSize: 12, textAlign: "center" },
});

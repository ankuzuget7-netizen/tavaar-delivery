import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EditorialIcon, Price, SurfaceCard } from "@/components/editorial-ui";
import { useCustomerState } from "@/components/customer-state";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function DishScreen() {
  const colors = useColors();
  const { id, restaurantId } = useLocalSearchParams<{ id: string; restaurantId: string }>();
  const itemId = Number(id);
  const ownerRestaurantId = Number(restaurantId);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCustomerState();
  const menu = trpc.restaurants.menu.useQuery({ restaurantId: ownerRestaurantId }, { enabled: Number.isInteger(ownerRestaurantId) && ownerRestaurantId > 0 });
  if (menu.isLoading) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><View style={styles.center}><EditorialIcon name="sparkles-outline" /><Text style={[styles.loading, { color: colors.foreground }]}>Загружаем блюдо</Text><Text style={[styles.body, { color: colors.muted }]}>Проверяем актуальность меню.</Text></View></ScreenContainer>;
  const item = menu.data?.items.find((candidate) => candidate.id === itemId);
  if (menu.isError || !menu.data || !item) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><View style={styles.center}><EditorialIcon name="fast-food-outline" tone="muted" size={30} /><Text style={[styles.title, { color: colors.foreground }]}>Блюдо недоступно</Text><Text style={[styles.body, { color: colors.muted }]}>Блюдо удалено, скрыто или ресторан больше не активен.</Text></View></ScreenContainer>;
  const total = item.priceKopecks * quantity;
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>К меню</Text></Pressable><Text style={[styles.kicker, { color: colors.primary }]}>БЛЮДО</Text></View>
    <View style={[styles.hero, { backgroundColor: `${colors.primary}16` }]}><View style={[styles.heroMark, { backgroundColor: colors.surface }]}><Ionicons name="fast-food-outline" size={54} color={colors.primary} /></View><Text style={[styles.heroNote, { color: colors.muted }]}>Фото блюда пока не добавлено заведением</Text></View>
    <Text style={[styles.restaurant, { color: colors.primary }]}>{menu.data.restaurant.name.toUpperCase()}</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>{item.name}</Text>
    <View style={styles.priceRow}><Price kopecks={item.priceKopecks} large /><View style={[styles.time, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="time-outline" size={15} color={colors.primary} /><Text style={[styles.timeText, { color: colors.muted }]}>{item.prepMinutes} мин</Text></View></View>
    <Text style={[styles.description, { color: colors.muted }]}>{item.description || "Описание и состав блюда пока не указаны заведением."}</Text>
    <SurfaceCard style={styles.info}><View style={styles.infoHeader}><EditorialIcon name="nutrition-outline" size={18} /><Text style={[styles.infoTitle, { color: colors.foreground }]}>Состав и детали</Text></View><Text style={[styles.infoText, { color: colors.muted }]}>{item.description || "Состав не указан. Уточните детали у заведения перед заказом."}</Text></SurfaceCard>
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Количество</Text>
    <View style={styles.quantityRow}><Pressable onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={[styles.step, { borderColor: colors.border }]}><Text style={[styles.stepText, { color: colors.foreground }]}>−</Text></Pressable><Text style={[styles.quantity, { color: colors.foreground }]}>{quantity}</Text><Pressable onPress={() => setQuantity((value) => Math.min(99, value + 1))} style={[styles.step, { backgroundColor: colors.primary }]}><Text style={styles.stepLight}>+</Text></Pressable></View>
    <Pressable onPress={() => { addToCart({ menuItemId: item.id, restaurantId: menu.data.restaurant.id, restaurantName: menu.data.restaurant.name, name: item.name, description: item.description, priceKopecks: item.priceKopecks, prepMinutes: item.prepMinutes, quantity }); router.push("/(tabs)/cart" as never); }} style={[styles.add, { backgroundColor: colors.primary }]}><Text style={styles.addText}>Добавить в корзину</Text><Text style={styles.addTotal}>{`${(total / 100).toFixed(2).replace(".", ",")} ₽`}</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 42, gap: 14 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, back: { flexDirection: "row", alignItems: "center", gap: 7 }, backText: { fontSize: 14, fontWeight: "800" }, kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }, hero: { height: 238, borderRadius: 29, alignItems: "center", justifyContent: "center", gap: 11 }, heroMark: { width: 94, height: 94, borderRadius: 32, alignItems: "center", justifyContent: "center" }, heroNote: { fontSize: 12 }, restaurant: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 2 }, title: { fontSize: 32, lineHeight: 36, fontWeight: "900", letterSpacing: -0.9 }, priceRow: { flexDirection: "row", alignItems: "center", gap: 10 }, time: { minHeight: 31, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 }, timeText: { fontSize: 12, fontWeight: "800" }, description: { fontSize: 15, lineHeight: 22 }, info: { gap: 9 }, infoHeader: { flexDirection: "row", alignItems: "center", gap: 9 }, infoTitle: { fontSize: 16, fontWeight: "900" }, infoText: { fontSize: 13, lineHeight: 20 }, sectionTitle: { fontSize: 19, fontWeight: "900", marginTop: 4 }, quantityRow: { flexDirection: "row", alignItems: "center", gap: 12 }, step: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, stepText: { fontSize: 24, lineHeight: 24 }, stepLight: { color: "#FFF8F1", fontSize: 24, lineHeight: 24 }, quantity: { fontSize: 19, fontWeight: "900", minWidth: 27, textAlign: "center" }, add: { minHeight: 55, borderRadius: 17, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }, addText: { color: "#FFF8F1", fontSize: 14, fontWeight: "900" }, addTotal: { color: "#FFF8F1", fontSize: 16, fontWeight: "900" }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }, loading: { fontSize: 20, fontWeight: "900" }, body: { fontSize: 14, lineHeight: 21, textAlign: "center" } });

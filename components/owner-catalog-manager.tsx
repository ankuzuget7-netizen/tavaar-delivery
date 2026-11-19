import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const statusLabels = { active: "Активно", suspended: "Приостановлено", blocked: "Заблокировано" } as const;
type RestaurantStatus = keyof typeof statusLabels;

export function OwnerCatalogManager() {
  const colors = useColors();
  const restaurants = trpc.ownerAdmin.restaurants.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => restaurants.data?.find((item) => item.id === selectedId) ?? restaurants.data?.[0], [restaurants.data, selectedId]);
  const categories = trpc.ownerAdmin.categories.useQuery(selected ? { restaurantId: selected.id } : undefined, { enabled: Boolean(selected) });
  const updateRestaurant = trpc.ownerAdmin.updateRestaurant.useMutation({ onSuccess: () => void restaurants.refetch() });
  const createCategory = trpc.ownerAdmin.createCategory.useMutation({ onSuccess: () => { setCategoryName(""); void categories.refetch(); } });
  const updateCategory = trpc.ownerAdmin.updateCategory.useMutation({ onSuccess: () => { setEditingCategoryId(null); void categories.refetch(); } });
  const deleteCategory = trpc.ownerAdmin.deleteCategory.useMutation({ onSuccess: () => void categories.refetch() });
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const selectRestaurant = (item: typeof selected) => {
    if (!item) return;
    setSelectedId(item.id);
    setName(item.name);
    setType(item.type);
    setAddress(item.address);
    setPhone(item.phone);
    setDescription(item.description ?? "");
  };
  if (restaurants.isLoading) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.center, { color: colors.muted }]}>Загружаем заведения…</Text></ScreenContainer>;
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>КАТАЛОГ ПЛАТФОРМЫ</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Заведения и категории</Text>
    <Text style={[styles.subtitle, { color: colors.muted }]}>Редактируйте только реальные одобренные записи. Удаление категории с блюдами запрещено, чтобы не нарушить историю каталога.</Text>
    {restaurants.isError ? <Text style={[styles.error, { color: colors.error }]}>Не удалось загрузить заведения.</Text> : null}
    <Text style={[styles.section, { color: colors.foreground }]}>Список заведений · {restaurants.data?.length ?? 0}</Text>
    <View style={styles.restaurantList}>{(restaurants.data ?? []).map((item) => <Pressable key={item.id} onPress={() => selectRestaurant(item)} style={[styles.restaurantCard, { backgroundColor: selected?.id === item.id ? colors.primary + "12" : colors.surface, borderColor: selected?.id === item.id ? colors.primary : colors.border }]}><View style={styles.cardIcon}><Ionicons name="restaurant-outline" size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.cardBody, { color: colors.muted }]}>{item.type} · {item.address}</Text></View><Text style={[styles.status, { color: item.status === "active" ? colors.success : colors.warning }]}>{statusLabels[item.status]}</Text></Pressable>)}</View>
    {selected ? <>
      <Text style={[styles.section, { color: colors.foreground }]}>Карточка заведения #{selected.id}</Text>
      <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Field label="Название" value={name || selected.name} onChangeText={setName} colors={colors} />
        <Field label="Тип / категория" value={type || selected.type} onChangeText={setType} colors={colors} />
        <Field label="Адрес" value={address || selected.address} onChangeText={setAddress} colors={colors} />
        <Field label="Телефон" value={phone || selected.phone} onChangeText={setPhone} colors={colors} keyboardType="phone-pad" />
        <Field label="Описание" value={description} onChangeText={setDescription} colors={colors} placeholder="Не изменять, если описание не нужно обновлять" multiline />
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Статус публикации</Text>
        <View style={styles.statusRow}>{(Object.keys(statusLabels) as RestaurantStatus[]).map((status) => <Pressable key={status} onPress={() => updateRestaurant.mutate({ id: selected.id, name: name || selected.name, type: type || selected.type, address: address || selected.address, phone: phone || selected.phone, description, status })} style={[styles.statusButton, { borderColor: selected.status === status ? colors.primary : colors.border, backgroundColor: selected.status === status ? colors.primary + "12" : colors.background }]}><Text style={[styles.statusButtonText, { color: selected.status === status ? colors.primary : colors.foreground }]}>{statusLabels[status]}</Text></Pressable>)}</View>
        <Pressable disabled={updateRestaurant.isPending} onPress={() => updateRestaurant.mutate({ id: selected.id, name: name.trim(), type: type.trim(), address: address.trim(), phone: phone.trim(), description: description.trim(), status: selected.status })} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryButtonText}>{updateRestaurant.isPending ? "Сохраняем…" : "Сохранить изменения"}</Text></Pressable>
        {updateRestaurant.error ? <Text style={[styles.error, { color: colors.error }]}>{formatCatalogError(updateRestaurant.error.message)}</Text> : null}
      </View>
      <Text style={[styles.section, { color: colors.foreground }]}>Категории меню</Text>
      <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Field label="Новая категория" value={categoryName} onChangeText={setCategoryName} colors={colors} placeholder="Например, Суши" />
        <Pressable disabled={!categoryName.trim() || createCategory.isPending} onPress={() => createCategory.mutate({ restaurantId: selected.id, name: categoryName.trim() })} style={[styles.primaryButton, { backgroundColor: categoryName.trim() ? colors.primary : colors.border }]}><Text style={[styles.primaryButtonText, { color: categoryName.trim() ? "#FFF8F1" : colors.muted }]}>{createCategory.isPending ? "Добавляем…" : "Добавить категорию"}</Text></Pressable>
        {categories.isLoading ? <Text style={[styles.cardBody, { color: colors.muted }]}>Загружаем категории…</Text> : (categories.data ?? []).map((category) => <View key={category.id} style={[styles.categoryRow, { borderColor: colors.border }]}>{editingCategoryId === category.id ? <TextInput value={editingCategoryName} onChangeText={setEditingCategoryName} autoFocus style={[styles.categoryInput, { color: colors.foreground, borderColor: colors.primary }]} /> : <View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.foreground }]}>{category.name}</Text><Text style={[styles.cardBody, { color: colors.muted }]}>Порядок: {category.sortOrder}</Text></View>}<View style={styles.categoryActions}>{editingCategoryId === category.id ? <Pressable onPress={() => updateCategory.mutate({ id: category.id, name: editingCategoryName.trim(), sortOrder: category.sortOrder })}><Ionicons name="checkmark-circle" size={23} color={colors.success} /></Pressable> : <Pressable onPress={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); }}><Ionicons name="create-outline" size={21} color={colors.primary} /></Pressable>}<Pressable onPress={() => Alert.alert("Удалить категорию?", "Удаление возможно только если в категории нет блюд.", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => deleteCategory.mutate({ id: category.id }) }])}><Ionicons name="trash-outline" size={21} color={colors.error} /></Pressable></View></View>)}
        {categories.data?.length === 0 ? <Text style={[styles.cardBody, { color: colors.muted }]}>Категорий пока нет.</Text> : null}
        {createCategory.error || updateCategory.error || deleteCategory.error ? <Text style={[styles.error, { color: colors.error }]}>{formatCatalogError((createCategory.error || updateCategory.error || deleteCategory.error)?.message)}</Text> : null}
      </View>
    </> : <Text style={[styles.empty, { color: colors.muted }]}>Выберите заведение для редактирования.</Text>}
  </ScrollView></ScreenContainer>;
}

function Field({ label, colors, ...props }: { label: string; colors: ReturnType<typeof useColors> } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text><TextInput {...props} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }, props.multiline && styles.multiline]} /></View>; }

function formatCatalogError(message?: string) {
  if (message?.includes("CATEGORY_HAS_ITEMS")) return "Категорию нельзя удалить: сначала перенесите или удалите блюда из неё.";
  if (message?.includes("CATEGORY_NAME_REQUIRED")) return "Введите название категории.";
  if (message?.includes("RESTAURANT_NOT_FOUND")) return "Заведение не найдено или уже удалено.";
  if (message?.includes("CATEGORY_NOT_FOUND")) return "Категория не найдена или уже удалена.";
  return message || "Не удалось выполнить операцию.";
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 24, paddingBottom: 44, gap: 12, maxWidth: 960, width: "100%", alignSelf: "center" }, center: { textAlign: "center", marginTop: 40 }, eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 }, title: { fontSize: 31, fontWeight: "900" }, subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 5 }, section: { fontSize: 19, fontWeight: "900", marginTop: 10 }, restaurantList: { gap: 8 }, restaurantCard: { minHeight: 70, borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }, cardIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#6B151C12" }, cardTitle: { fontSize: 15, fontWeight: "900" }, cardBody: { fontSize: 12, lineHeight: 18, marginTop: 3 }, status: { fontSize: 11, fontWeight: "900" }, formCard: { borderWidth: 1, borderRadius: 19, padding: 15, gap: 11 }, field: { gap: 6 }, fieldLabel: { fontSize: 12, fontWeight: "900" }, input: { minHeight: 45, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, multiline: { minHeight: 72, textAlignVertical: "top" }, statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, statusButton: { borderWidth: 1, borderRadius: 11, minHeight: 38, paddingHorizontal: 12, justifyContent: "center" }, statusButtonText: { fontSize: 12, fontWeight: "800" }, primaryButton: { minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, primaryButtonText: { color: "#FFF8F1", fontSize: 13, fontWeight: "900" }, categoryRow: { minHeight: 58, borderBottomWidth: 1, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }, categoryActions: { flexDirection: "row", gap: 14, alignItems: "center" }, categoryInput: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14 }, error: { fontSize: 12, lineHeight: 18 }, empty: { textAlign: "center", paddingVertical: 25 } });

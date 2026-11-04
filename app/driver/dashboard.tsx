import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = { assigned: "Новый заказ", accepted: "Принят курьером", picked_up: "Забран", delivered: "Доставлен" };

export default function DriverDashboardScreen() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery();
  const profile = trpc.driver.profile.useQuery(undefined, { enabled: Boolean(me.data) });
  const assignments = trpc.driver.assignments.useQuery(undefined, { enabled: Boolean(me.data && profile.data) });
  const utils = trpc.useUtils();
  const register = trpc.driver.register.useMutation({ onSuccess: () => { utils.driver.profile.invalidate(); utils.driver.assignments.invalidate(); } });
  const updateStatus = trpc.driver.updateStatus.useMutation({ onSuccess: () => utils.driver.assignments.invalidate() });
  const sendLocation = trpc.driver.location.useMutation();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");

  useEffect(() => {
    const active = assignments.data?.assignments.find((item) => item.assignment.status === "accepted" || item.assignment.status === "picked_up");
    if (!active || Platform.OS === "web") return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted" || cancelled) return;
      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 }, (position) => {
        if (!cancelled) sendLocation.mutate({ orderId: active.order.id, latitudeE6: Math.round(position.coords.latitude * 1_000_000), longitudeE6: Math.round(position.coords.longitude * 1_000_000), accuracyCm: position.coords.accuracy ? Math.round(position.coords.accuracy * 100) : undefined });
      });
    };
    void start();
    return () => { cancelled = true; subscription?.remove(); };
  }, [assignments.data?.assignments, sendLocation]);

  if (me.isLoading) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.loading, { color: colors.muted }]}>Проверяем доступ…</Text></ScreenContainer>;
  if (!me.data) return <Locked colors={colors} />;
  if (profile.isLoading) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.loading, { color: colors.muted }]}>Загружаем профиль курьера…</Text></ScreenContainer>;
  if (profile.isError) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable><Text style={[styles.eyebrow, { color: colors.primary }]}>ДЛЯ КУРЬЕРА</Text><Text style={[styles.title, { color: colors.foreground }]}>Стать курьером</Text><Text style={[styles.subtitle, { color: colors.muted }]}>После регистрации владелец заведения сможет назначить вам доставку.</Text><View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}><TextInput value={displayName} onChangeText={setDisplayName} placeholder="Имя и фамилия" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /><TextInput value={phone} onChangeText={setPhone} placeholder="Телефон" keyboardType="phone-pad" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /><TextInput value={vehicle} onChangeText={setVehicle} placeholder="Автомобиль или способ доставки" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /><Pressable disabled={displayName.trim().length < 2 || phone.trim().length < 7 || register.isPending} onPress={() => register.mutate({ displayName, phone, vehicle: vehicle || undefined })} style={[styles.primaryButton, { backgroundColor: displayName.trim().length >= 2 && phone.trim().length >= 7 ? colors.primary : colors.border }]}><Text style={[styles.primaryText, { color: displayName.trim().length >= 2 && phone.trim().length >= 7 ? "#FFF8F1" : colors.muted }]}>{register.isPending ? "Сохраняем…" : "Зарегистрироваться"}</Text></Pressable>{register.error ? <Text style={[styles.error, { color: colors.error }]}>{register.error.message}</Text> : null}</View></ScrollView></ScreenContainer>;

  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable><Text style={[styles.eyebrow, { color: colors.primary }]}>КУРЬЕР</Text><Text style={[styles.title, { color: colors.foreground }]}>{profile.data!.displayName}</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{profile.data!.vehicle ?? "Способ доставки не указан"} · GPS включается для активной доставки</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Мои доставки</Text>{assignments.data?.assignments.length ? assignments.data.assignments.map(({ assignment, order, restaurant }) => <AssignmentCard key={assignment.id} assignment={assignment} order={order} restaurant={restaurant} colors={colors} disabled={updateStatus.isPending} onStatus={(status) => updateStatus.mutate({ orderId: order.id, status })} />) : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="bicycle-outline" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Активных доставок нет</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>Когда ресторан назначит вам заказ, он появится здесь.</Text></View>}</ScrollView></ScreenContainer>;
}
function AssignmentCard({ assignment, order, restaurant, colors, disabled, onStatus }: { assignment: any; order: any; restaurant: any; colors: ReturnType<typeof useColors>; disabled: boolean; onStatus: (status: "accepted" | "picked_up" | "delivered") => void }) { const next: Record<string, { label: string; status: "accepted" | "picked_up" | "delivered" } | undefined> = { assigned: { label: "Принять доставку", status: "accepted" }, accepted: { label: "Забрать заказ", status: "picked_up" }, picked_up: { label: "Подтвердить доставку", status: "delivered" } }; return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.restaurant, { color: colors.foreground }]}>{restaurant.name}</Text><Text style={[styles.meta, { color: colors.muted }]}>Заказ #{order.id} · {statusLabels[assignment.status]}</Text><Text style={[styles.address, { color: colors.foreground }]}>{order.address}</Text>{next[assignment.status] ? <Pressable disabled={disabled} onPress={() => onStatus(next[assignment.status]!.status)} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>{next[assignment.status]!.label}</Text></Pressable> : null}</View>; }
function Locked({ colors }: { colors: ReturnType<typeof useColors> }) { return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><View style={styles.locked}><Ionicons name="lock-closed-outline" size={32} color={colors.warning} /><Text style={[styles.lockTitle, { color: colors.foreground }]}>Войдите, чтобы открыть кабинет курьера</Text><Text style={[styles.subtitle, { color: colors.muted }]}>GPS и доставки доступны только авторизованному пользователю.</Text></View></ScreenContainer>; }
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 40, gap: 13 }, back: { flexDirection: "row", alignItems: "center", gap: 7 }, backText: { fontSize: 14, fontWeight: "700" }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 29, fontWeight: "800" }, subtitle: { fontSize: 13, lineHeight: 19 }, form: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 10 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, primaryButton: { minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 15, marginTop: 4 }, primaryText: { fontSize: 13, fontWeight: "800", color: "#FFF8F1" }, error: { fontSize: 12 }, sectionTitle: { fontSize: 20, fontWeight: "800", marginTop: 8 }, card: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 8 }, restaurant: { fontSize: 16, fontWeight: "800" }, meta: { fontSize: 12 }, address: { fontSize: 14, lineHeight: 19 }, empty: { borderWidth: 1, borderRadius: 20, padding: 26, alignItems: "center", gap: 8 }, emptyTitle: { fontSize: 17, fontWeight: "800" }, emptyBody: { fontSize: 13, lineHeight: 19, textAlign: "center" }, loading: { textAlign: "center", marginTop: 30 }, locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }, lockTitle: { fontSize: 21, textAlign: "center", fontWeight: "800" } });

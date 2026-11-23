import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = { assigned: "Новый заказ", accepted: "Принят курьером", picked_up: "Забран", delivered: "Доставлен" };
const orderStatusLabels: Record<string, string> = { courier_assigned: "Ожидает передачи заведением", handed_to_courier: "Передан курьеру", in_transit: "В пути" };

function callNumber(value?: string | null) {
  const phone = value?.trim();
  if (!phone) return;
  void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => undefined);
}

export default function DriverDashboardScreen() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery();
  const profile = trpc.driver.profile.useQuery(undefined, { enabled: Boolean(me.data) });
  const assignments = trpc.driver.assignments.useQuery(undefined, { enabled: Boolean(me.data && profile.data), refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const register = trpc.driver.register.useMutation({ onSuccess: () => { void utils.driver.profile.invalidate(); void utils.driver.assignments.invalidate(); } });
  const updateStatus = trpc.driver.updateStatus.useMutation({ onSuccess: () => { void utils.driver.assignments.invalidate(); void utils.driver.profile.invalidate(); } });
  const setAvailability = trpc.driver.setAvailability.useMutation({ onSuccess: () => void utils.driver.profile.invalidate() });
  const sendLocation = trpc.driver.location.useMutation();
  const [displayName, setDisplayName] = useState("");
  const [vehicle, setVehicle] = useState("");

  useEffect(() => {
    const active = assignments.data?.assignments.find((item) => item.assignment.status === "picked_up" && item.order.status === "in_transit");
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
  if (profile.isError) {
    const verifiedPhone = Boolean(me.data.phone && me.data.phoneVerifiedAt);
    const effectiveName = displayName || me.data.name || "";
    return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>РАБОЧАЯ ПАНЕЛЬ КУРЬЕРА</Text><Text style={[styles.title, { color: colors.foreground }]}>Стать курьером</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Профиль создаётся для вошедшего аккаунта с подтверждённым номером. Владелец заведения сможет добавить этот аккаунт в команду.</Text>
      <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput value={effectiveName} onChangeText={setDisplayName} placeholder="Имя и фамилия" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
        <TextInput value={me.data.phone ?? "Телефон не указан"} editable={false} placeholder="Подтверждённый телефон аккаунта" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.muted, backgroundColor: colors.background, borderColor: colors.border }]} />
        <TextInput value={vehicle} onChangeText={setVehicle} placeholder="Автомобиль или способ доставки" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
        <Pressable disabled={!verifiedPhone || effectiveName.trim().length < 2 || register.isPending} onPress={() => register.mutate({ displayName: effectiveName.trim(), phone: me.data!.phone!, vehicle: vehicle.trim() || undefined })} style={[styles.primaryButton, { backgroundColor: verifiedPhone && effectiveName.trim().length >= 2 && !register.isPending ? colors.primary : colors.border }]}><Text style={[styles.primaryText, { color: verifiedPhone && effectiveName.trim().length >= 2 && !register.isPending ? "#FFF8F1" : colors.muted }]}>{register.isPending ? "Сохраняем…" : "Создать профиль курьера"}</Text></Pressable>
        {!verifiedPhone ? <Text style={[styles.error, { color: colors.warning }]}>Сначала подтвердите номер телефона в настройках аккаунта.</Text> : null}
        {register.error ? <Text style={[styles.error, { color: colors.error }]}>{register.error.message}</Text> : null}
      </View>
    </ScrollView></ScreenContainer>;
  }

  if (!profile.data) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.loading, { color: colors.muted }]}>Загружаем профиль курьера…</Text></ScreenContainer>;
  const driver = profile.data;
  const availabilityLabel = driver.status === "available" ? "В сети" : driver.status === "busy" ? "На доставке" : driver.status === "suspended" ? "Профиль заблокирован" : "Не в сети";
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>ОТДЕЛЬНАЯ ПАНЕЛЬ КУРЬЕРА</Text><Text style={[styles.title, { color: colors.foreground }]}>{driver.displayName}</Text>
    <Text style={[styles.subtitle, { color: colors.muted }]}>{driver.vehicle ?? "Способ доставки не указан"} · GPS передаётся только во время доставки</Text>
    <View style={[styles.availability, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Доступность</Text><Text style={[styles.meta, { color: driver.status === "available" ? colors.success : driver.status === "suspended" ? colors.error : colors.muted }]}>{availabilityLabel}</Text></View>{driver.status !== "busy" && driver.status !== "suspended" ? <Pressable disabled={setAvailability.isPending} onPress={() => setAvailability.mutate({ status: driver.status === "available" ? "offline" : "available" })} style={[styles.smallButton, { backgroundColor: colors.primary }]}><Text style={styles.smallButtonText}>{setAvailability.isPending ? "Сохраняем…" : driver.status === "available" ? "Уйти в офлайн" : "Выйти в сеть"}</Text></Pressable> : null}</View>
    {setAvailability.error ? <Text style={[styles.error, { color: colors.error }]}>{setAvailability.error.message}</Text> : null}
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Мои доставки</Text>
    {assignments.isError ? <Text style={[styles.error, { color: colors.error }]}>{assignments.error.message}</Text> : null}
    {assignments.data?.assignments.length ? assignments.data.assignments.map(({ assignment, order, restaurant }) => <AssignmentCard key={assignment.id} assignment={assignment} order={order} restaurant={restaurant} colors={colors} disabled={updateStatus.isPending} onStatus={(status) => updateStatus.mutate({ orderId: order.id, status })} />) : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="bicycle-outline" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Активных доставок нет</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>Назначенные доставки появятся здесь. Панель обновляет список автоматически.</Text></View>}
  </ScrollView></ScreenContainer>;
}

function ContactButton({ title, phone, colors }: { title: string; phone?: string | null; colors: ReturnType<typeof useColors> }) {
  if (!phone) return null;
  return <Pressable onPress={() => callNumber(phone)} style={[styles.contactButton, { borderColor: colors.border }]}><Ionicons name="call-outline" size={17} color={colors.primary} /><Text style={[styles.contactText, { color: colors.primary }]}>{title} · {phone}</Text></Pressable>;
}

function AssignmentCard({ assignment, order, restaurant, colors, disabled, onStatus }: { assignment: any; order: any; restaurant: any; colors: ReturnType<typeof useColors>; disabled: boolean; onStatus: (status: "accepted" | "picked_up" | "delivered") => void }) {
  const next: Record<string, { label: string; status: "accepted" | "picked_up" | "delivered" } | undefined> = {
    assigned: { label: "Принять доставку", status: "accepted" },
    accepted: order.status === "handed_to_courier" ? { label: "Забрать заказ", status: "picked_up" } : undefined,
    picked_up: { label: "Подтвердить доставку", status: "delivered" },
  };
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.restaurant, { color: colors.foreground }]}>{restaurant.name}</Text>
    <Text style={[styles.meta, { color: colors.muted }]}>Заказ #{order.id} · {statusLabels[assignment.status]} · {orderStatusLabels[order.status] ?? order.status}</Text>
    <Text style={[styles.address, { color: colors.foreground }]}>{order.address}</Text>
    <ContactButton title="Позвонить в заведение" phone={restaurant.phone} colors={colors} />
    <ContactButton title="Позвонить клиенту" phone={order.contactPhone} colors={colors} />
    {assignment.status === "accepted" && order.status !== "handed_to_courier" ? <Text style={[styles.handoffHint, { color: colors.warning }]}>Вы приняли доставку. Дождитесь, пока заведение отметит передачу заказа.</Text> : null}
    {next[assignment.status] ? <Pressable disabled={disabled} onPress={() => onStatus(next[assignment.status]!.status)} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>{disabled ? "Обновляем…" : next[assignment.status]!.label}</Text></Pressable> : null}
  </View>;
}

function Locked({ colors }: { colors: ReturnType<typeof useColors> }) { return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><View style={styles.locked}><Ionicons name="lock-closed-outline" size={32} color={colors.warning} /><Text style={[styles.lockTitle, { color: colors.foreground }]}>Войдите, чтобы открыть кабинет курьера</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Назначенные доставки, звонки и GPS доступны только авторизованному пользователю.</Text><Pressable onPress={() => router.push("/auth/login" as never)} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>Войти по телефону</Text></Pressable></View></ScreenContainer>; }

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 40, gap: 13 }, back: { flexDirection: "row", alignItems: "center", gap: 7 }, backText: { fontSize: 14, fontWeight: "700" }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 29, fontWeight: "800" }, subtitle: { fontSize: 13, lineHeight: 19 }, form: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 10 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, primaryButton: { minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 15, marginTop: 4 }, primaryText: { fontSize: 13, fontWeight: "800", color: "#FFF8F1" }, smallButton: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, smallButtonText: { color: "#FFF8F1", fontSize: 11, fontWeight: "800" }, error: { fontSize: 12, lineHeight: 18 }, sectionTitle: { fontSize: 20, fontWeight: "800", marginTop: 8 }, availability: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }, card: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 8 }, restaurant: { fontSize: 16, fontWeight: "800" }, meta: { fontSize: 12 }, address: { fontSize: 14, lineHeight: 19 }, contactButton: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 }, contactText: { fontSize: 12, fontWeight: "700" }, handoffHint: { fontSize: 12, lineHeight: 18, fontWeight: "700" }, empty: { borderWidth: 1, borderRadius: 20, padding: 26, alignItems: "center", gap: 8 }, emptyTitle: { fontSize: 17, fontWeight: "800" }, emptyBody: { fontSize: 13, lineHeight: 19, textAlign: "center" }, loading: { textAlign: "center", marginTop: 30 }, locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }, lockTitle: { fontSize: 21, textAlign: "center", fontWeight: "800" } });

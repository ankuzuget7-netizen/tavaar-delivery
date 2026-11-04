import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function SettingsScreen() {
  const colors = useColors();
  const profile = trpc.auth.profile.useQuery();
  if (profile.isLoading) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.muted, { color: colors.muted }]}>Загружаем настройки…</Text></ScreenContainer>;
  if (!profile.data) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><Text style={[styles.muted, { color: colors.muted }]}>Профиль недоступен. Войдите в аккаунт.</Text></ScreenContainer>;
  return <SettingsForm profile={profile.data} colors={colors} />;
}

function SettingsForm({ profile, colors }: { profile: { name: string | null; email: string | null; phone: string | null; phoneVerifiedAt: Date | null }; colors: ReturnType<typeof useColors> }) {
  const [name, setName] = useState(profile.name || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [notice, setNotice] = useState("");
  const utils = trpc.useUtils();
  const update = trpc.auth.updateProfile.useMutation({ onSuccess: () => { setNotice("Профиль сохранён."); void utils.auth.profile.invalidate(); } });
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable>
    <Text style={[styles.title, { color: colors.foreground }]}>Настройки аккаунта</Text>
    <Text style={[styles.section, { color: colors.foreground }]}>Профиль</Text>
    {profile.email ? <><Text style={[styles.label, { color: colors.foreground }]}>Legacy email</Text><Text style={[styles.readonly, { color: colors.muted }]}>{profile.email}</Text></> : null}
    <Text style={[styles.label, { color: colors.foreground }]}>Имя</Text>
    <TextInput value={name} onChangeText={setName} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
    <Text style={[styles.label, { color: colors.foreground }]}>{profile.phoneVerifiedAt ? "Подтверждённый телефон" : "Телефон"}</Text>
    <TextInput value={phone} onChangeText={setPhone} editable={!profile.phoneVerifiedAt} keyboardType="phone-pad" placeholder="+7 900 000-00-00" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface, opacity: profile.phoneVerifiedAt ? 0.65 : 1 }]} />
    <Text style={[styles.muted, { color: colors.muted }]}>{profile.phoneVerifiedAt ? "Для смены подтверждённого номера нужно пройти новое подтверждение через Telegram или MAX." : "Номер можно добавить для связи по доставке."}</Text>
    <Pressable disabled={update.isPending || !name.trim()} onPress={() => update.mutate({ name, phone })} style={[styles.primary, { backgroundColor: name.trim() ? colors.primary : colors.border }]}><Text style={styles.primaryText}>{update.isPending ? "Сохраняем…" : "Сохранить профиль"}</Text></Pressable>
    <Text style={[styles.section, { color: colors.foreground, marginTop: 8 }]}>Безопасность</Text>
    <Text style={[styles.muted, { color: colors.muted }]}>Вход и регистрация подтверждаются одноразовым кодом через официальный бот Telegram или MAX. Коды не хранятся в приложении.</Text>
    {notice ? <Text style={[styles.notice, { color: colors.success }]}>{notice}</Text> : null}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, gap: 13, paddingBottom: 38 }, back: { flexDirection: "row", alignItems: "center", gap: 7 }, backText: { fontSize: 14, fontWeight: "700" }, title: { fontSize: 29, fontWeight: "800" }, section: { fontSize: 18, fontWeight: "800", marginBottom: 2 }, label: { fontSize: 12, fontWeight: "800" }, readonly: { fontSize: 14, paddingVertical: 10 }, input: { minHeight: 45, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, primary: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 4 }, primaryText: { color: "#FFF8F1", fontSize: 13, fontWeight: "800" }, muted: { fontSize: 13, lineHeight: 19 }, notice: { fontSize: 13, lineHeight: 19 } });

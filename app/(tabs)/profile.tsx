import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EditorialIcon, SurfaceCard } from "@/components/editorial-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";

export default function ProfileScreen() {
  const colors = useColors();
  const me = trpc.auth.me.useQuery();
  const profile = trpc.auth.profile.useQuery(undefined, { enabled: Boolean(me.data) });
  const logout = trpc.auth.logout.useMutation({ onSuccess: async () => { await Auth.removeSessionToken(); await Auth.clearUserInfo(); void me.refetch(); } });
  if (!me.data) return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><View style={styles.locked}><EditorialIcon name="person-outline" size={32} /><Text style={[styles.lockTitle, { color: colors.foreground }]}>Ваш личный кабинет</Text><Text style={[styles.lockBody, { color: colors.muted }]}>Войдите по номеру телефона, чтобы открыть профиль, адреса, избранное и историю заказов.</Text><Pressable onPress={() => router.push("/auth/login" as never)} style={[styles.primary, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>Войти по телефону</Text></Pressable><Pressable onPress={() => router.push("/auth/register" as never)}><Text style={[styles.link, { color: colors.primary }]}>Создать аккаунт</Text></Pressable></View></ScreenContainer>;
  const user = profile.data ?? me.data;
  const verified = Boolean((user as { phoneVerifiedAt?: Date | null }).phoneVerifiedAt);
  const initials = (user.name || "АД").slice(0, 2).toUpperCase();
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={[styles.kicker, { color: colors.primary }]}>ЛИЧНЫЙ КАБИНЕТ</Text><Text style={[styles.title, { color: colors.foreground }]}>Профиль</Text>
    <SurfaceCard style={styles.account}><View style={[styles.avatar, { backgroundColor: colors.primary }]}><Text style={styles.avatarText}>{initials}</Text></View><View style={{ flex: 1 }}><Text style={[styles.accountName, { color: colors.foreground }]}>{user.name || "Покупатель"}</Text><Text style={[styles.accountContact, { color: colors.muted }]}>{user.phone || user.email || "Телефон не указан"}</Text><View style={styles.verifyRow}><Ionicons name={verified ? "checkmark-circle" : "alert-circle"} size={14} color={verified ? colors.success : colors.warning} /><Text style={[styles.verify, { color: verified ? colors.success : colors.warning }]}>{verified ? "Телефон подтверждён" : "Телефон не подтверждён"}</Text></View></View><Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} /></SurfaceCard>
    <Text style={[styles.section, { color: colors.foreground }]}>Аккаунт</Text>
    <ActionRow icon="settings-outline" title="Настройки аккаунта" body="Имя, телефон и безопасность" onPress={() => router.push("/account/settings" as never)} colors={colors} />
    <ActionRow icon="heart-outline" title="Избранное" body="Сохранённые заведения и блюда" onPress={() => router.push("/account/favorites" as never)} colors={colors} />
    <ActionRow icon="location-outline" title="Адреса доставки" body="Добавление и основной адрес" onPress={() => router.push("/account/addresses" as never)} colors={colors} />
    <Text style={[styles.section, { color: colors.foreground }]}>Помощь</Text>
    <ActionRow icon="receipt-outline" title="Мои заказы" body="История и статусы заказов" onPress={() => router.push("/(tabs)/orders" as never)} colors={colors} />
    <ActionRow icon="chatbubble-ellipses-outline" title="Поддержка" body="FAQ и обращения" onPress={() => router.push("/(tabs)/support" as never)} colors={colors} />
    <Pressable onPress={() => logout.mutate()} style={[styles.logout, { borderColor: colors.error }]}><Ionicons name="log-out-outline" size={20} color={colors.error} /><Text style={[styles.logoutText, { color: colors.error }]}>{logout.isPending ? "Выходим…" : "Выйти из аккаунта"}</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

function ActionRow({ icon, title, body, onPress, colors }: { icon: "settings-outline" | "heart-outline" | "location-outline" | "receipt-outline" | "chatbubble-ellipses-outline"; title: string; body: string; onPress: () => void; colors: ReturnType<typeof useColors> }) { return <Pressable onPress={onPress}><SurfaceCard style={styles.action}><EditorialIcon name={icon} size={20} /><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.actionBody, { color: colors.muted }]}>{body}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></SurfaceCard></Pressable>; }

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 40, gap: 10 }, kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginTop: 7 }, title: { fontSize: 34, fontWeight: "900", letterSpacing: -1, marginBottom: 3 }, account: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginBottom: 8 }, avatar: { width: 58, height: 58, borderRadius: 21, alignItems: "center", justifyContent: "center" }, avatarText: { color: "#FFF8F1", fontSize: 16, fontWeight: "900" }, accountName: { fontSize: 18, fontWeight: "900" }, accountContact: { fontSize: 13, marginTop: 4 }, verifyRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }, verify: { fontSize: 11, fontWeight: "900" }, section: { fontSize: 18, fontWeight: "900", marginTop: 8, marginBottom: 2 }, action: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 12, padding: 13 }, actionTitle: { fontSize: 15, fontWeight: "900" }, actionBody: { fontSize: 12, marginTop: 3 }, logout: { minHeight: 49, borderWidth: 1.5, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 }, logoutText: { fontSize: 14, fontWeight: "900" }, locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 13 }, lockTitle: { fontSize: 25, fontWeight: "900", textAlign: "center" }, lockBody: { fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 330 }, primary: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, marginTop: 4 }, primaryText: { color: "#FFF8F1", fontSize: 14, fontWeight: "900" }, link: { fontSize: 13, fontWeight: "900" } });

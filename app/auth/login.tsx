import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Channel = "telegram" | "max";

export default function LoginScreen() {
  const colors = useColors();
  const [phone, setPhone] = useState("+7");
  const [channel, setChannel] = useState<Channel>("telegram");
  const challenge = trpc.auth.requestPhoneChallenge.useMutation({ onSuccess: (data) => router.push({ pathname: "/auth/phone-code", params: { challengeId: String(data.challengeId), deepLink: data.deepLink || "", channel: data.channel, phone } } as never) });
  const formattedPhone = formatPhone(phone);
  const valid = /^\+7\d{10}$/.test(formattedPhone);
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>АККАУНТ</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Войти по телефону</Text>
    <Text style={[styles.body, { color: colors.muted }]}>Введите номер и выберите мессенджер. Код придёт после запуска нашего бота.</Text>
    <Field label="Номер телефона" value={phone} onChangeText={(value) => setPhone(formatPhone(value))} placeholder="+7 900 000-00-00" colors={colors} keyboardType="phone-pad" />
    <Text style={[styles.label, { color: colors.foreground }]}>Получить код через</Text>
    <ChannelPicker channel={channel} setChannel={setChannel} colors={colors} />
    <Pressable disabled={challenge.isPending || !valid} onPress={() => challenge.mutate({ phone: formattedPhone, channel, purpose: "login" })} style={[styles.primary, { backgroundColor: valid ? colors.primary : colors.border }]}><Text style={[styles.primaryText, { color: valid ? "#FFF8F1" : colors.muted }]}>{challenge.isPending ? "Готовим ссылку…" : "Получить код"}</Text></Pressable>
    {challenge.error ? <Text style={[styles.error, { color: colors.error }]}>{challenge.error.message}</Text> : null}
    <Pressable onPress={() => router.push("/auth/register" as never)}><Text style={[styles.secondary, { color: colors.foreground }]}>Нет аккаунта? <Text style={{ color: colors.primary }}>Зарегистрироваться</Text></Text></Pressable>
  </ScrollView></ScreenContainer>;
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^8/, "7").replace(/^7/, "7").slice(0, 11);
  const normalized = digits ? (digits.startsWith("7") ? digits : `7${digits}`) : "7";
  const rest = normalized.slice(1);
  const parts = [rest.slice(0, 3), rest.slice(3, 6), rest.slice(6, 8), rest.slice(8, 10)].filter(Boolean);
  return `+7${parts[0] ? ` ${parts[0]}` : ""}${parts[1] ? ` ${parts[1]}` : ""}${parts[2] ? `-${parts[2]}` : ""}${parts[3] ? `-${parts[3]}` : ""}`;
}

function Field({ label, colors, ...props }: { label: string; colors: ReturnType<typeof useColors> } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput {...props} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /></View>; }
function ChannelPicker({ channel, setChannel, colors }: { channel: Channel; setChannel: (value: Channel) => void; colors: ReturnType<typeof useColors> }) { return <View style={styles.channels}>{([ ["telegram", "Telegram"], ["max", "MAX"] ] as const).map(([value, label]) => <Pressable key={value} onPress={() => setChannel(value)} style={[styles.channel, { borderColor: channel === value ? colors.primary : colors.border, backgroundColor: channel === value ? colors.primary + "12" : colors.surface }]}><Text style={[styles.channelText, { color: channel === value ? colors.primary : colors.foreground }]}>{label}</Text></Pressable>)}</View>; }
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 22, gap: 13, justifyContent: "center", flexGrow: 1 }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 31, fontWeight: "800" }, body: { fontSize: 14, lineHeight: 21, marginBottom: 8 }, field: { gap: 6 }, label: { fontSize: 13, fontWeight: "800" }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 15 }, channels: { flexDirection: "row", gap: 10 }, channel: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, channelText: { fontSize: 14, fontWeight: "800" }, primary: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 5 }, primaryText: { fontSize: 14, fontWeight: "800" }, error: { fontSize: 12, lineHeight: 18 }, secondary: { textAlign: "center", fontSize: 13, fontWeight: "700", marginTop: 8 } });

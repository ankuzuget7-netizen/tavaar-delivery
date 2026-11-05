import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { formatPhone, isCompleteRussianPhone } from "./login";

export default function RegisterScreen() {
  const colors = useColors();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const challenge = trpc.auth.requestPhoneChallenge.useMutation({ onSuccess: (data) => router.push({ pathname: "/auth/phone-code", params: { challengeId: String(data.challengeId), deepLink: data.deepLink || "", channel: data.channel, phone } } as never) });
  const formattedPhone = formatPhone(phone);
  const valid = name.trim().length >= 2 && isCompleteRussianPhone(formattedPhone) && terms && privacy;
  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>НОВЫЙ АККАУНТ</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Регистрация</Text>
    <Text style={[styles.body, { color: colors.muted }]}>Укажите имя и телефон. Код активации отправим через официальный бот MAX.</Text>
    <Field label="Имя" value={name} onChangeText={setName} placeholder="Как к вам обращаться?" colors={colors} />
    <Field label="Номер телефона" value={phone} onChangeText={(value) => setPhone(formatPhone(value))} placeholder="+7 900 000-00-00" colors={colors} keyboardType="phone-pad" />
    <Text style={[styles.label, { color: colors.foreground }]}>Канал подтверждения</Text>
    <View style={[styles.maxOnly, { borderColor: colors.primary, backgroundColor: colors.primary + "12" }]}><Text style={[styles.channelText, { color: colors.primary }]}>MAX</Text><Text style={[styles.channelHint, { color: colors.muted }]}>Telegram будет доступен позже</Text></View>
    <Consent checked={terms} onPress={() => setTerms(!terms)} text="Принимаю пользовательское соглашение" colors={colors} />
    <Consent checked={privacy} onPress={() => setPrivacy(!privacy)} text="Принимаю политику конфиденциальности" colors={colors} />
    <Pressable disabled={challenge.isPending || !valid} onPress={() => challenge.mutate({ name: name.trim(), phone: formattedPhone, channel: "max", purpose: "register", acceptTerms: true, acceptPrivacy: true })} style={[styles.primary, { backgroundColor: valid ? colors.primary : colors.border }]}><Text style={[styles.primaryText, { color: valid ? "#FFF8F1" : colors.muted }]}>{challenge.isPending ? "Готовим ссылку…" : "Продолжить"}</Text></Pressable>
    {challenge.error ? <Text style={[styles.error, { color: colors.error }]}>{challenge.error.message}</Text> : null}
    <Pressable onPress={() => router.push("/auth/login" as never)}><Text style={[styles.secondary, { color: colors.foreground }]}>Уже есть аккаунт? <Text style={{ color: colors.primary }}>Войти</Text></Text></Pressable>
  </ScrollView></ScreenContainer>;
}

function Field({ label, colors, ...props }: { label: string; colors: ReturnType<typeof useColors> } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput {...props} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /></View>; }
function Consent({ checked, onPress, text, colors }: { checked: boolean; onPress: () => void; text: string; colors: ReturnType<typeof useColors> }) { return <Pressable onPress={onPress} style={styles.consent}><View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : colors.surface }]}>{checked ? <Text style={styles.check}>✓</Text> : null}</View><Text style={[styles.consentText, { color: colors.foreground }]}>{text}</Text></Pressable>; }
  const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 22, gap: 12 }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 8 }, title: { fontSize: 31, fontWeight: "800" }, body: { fontSize: 13, lineHeight: 19, marginBottom: 5 }, field: { gap: 6 }, label: { fontSize: 13, fontWeight: "800" }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 15 }, maxOnly: { minHeight: 55, borderRadius: 13, borderWidth: 1.2, paddingHorizontal: 14, justifyContent: "center" }, channelText: { fontSize: 14, fontWeight: "800" }, channelHint: { fontSize: 11, marginTop: 3 }, consent: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }, checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center" }, check: { color: "#FFF8F1", fontWeight: "900" }, consentText: { fontSize: 13, fontWeight: "600" }, primary: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 }, primaryText: { fontSize: 14, fontWeight: "800" }, error: { fontSize: 12, lineHeight: 18 }, secondary: { textAlign: "center", fontSize: 13, fontWeight: "700", marginTop: 4 } });

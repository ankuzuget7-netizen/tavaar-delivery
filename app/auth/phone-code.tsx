import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";

export default function PhoneCodeScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ challengeId?: string; deepLink?: string; channel?: string; phone?: string }>();
  const challengeId = Number(params.challengeId);
  const deepLink = params.deepLink || "";
  const channel = params.channel === "max" ? "MAX" : "Telegram";
  const [code, setCode] = useState("");
  const [now, setNow] = useState(0);
  const { data: statusData, error: statusError, refetch } = trpc.auth.phoneChallengeStatus.useQuery({ challengeId }, { enabled: Number.isInteger(challengeId) && challengeId > 0, refetchInterval: 1500 });
  const verify = trpc.auth.verifyPhoneCode.useMutation({ onSuccess: async (data) => { if (data.sessionToken) await Auth.setSessionToken(data.sessionToken); router.replace("/(tabs)/profile" as never); } });
  const linked = Boolean(statusData?.linked);
  const remaining = statusData?.codeExpiresAt && now ? new Date(statusData.codeExpiresAt).getTime() - now : 0;
  const expiresText = now ? (remaining > 0 ? `${Math.ceil(remaining / 1000)} с` : "истёк") : "…";

  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()); void refetch(); }, 1000);
    return () => clearInterval(timer);
  }, [refetch]);

  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>ПОДТВЕРЖДЕНИЕ</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Введите код</Text>
    <Text style={[styles.body, { color: colors.muted }]}>Откройте бота {channel} по ссылке ниже и нажмите «Старт». После этого бот отправит код подтверждения для номера {params.phone || ""}.</Text>
    <Pressable disabled={!deepLink} onPress={() => deepLink && Linking.openURL(deepLink)} style={[styles.botButton, { borderColor: colors.primary, backgroundColor: colors.surface }]}><Text style={[styles.botButtonText, { color: colors.primary }]}>Открыть {channel}</Text></Pressable>
    <View style={[styles.status, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.dot, { backgroundColor: linked ? colors.success : colors.warning }]} /><Text style={[styles.statusText, { color: colors.foreground }]}>{linked ? "Бот подключён, код отправлен" : "Ожидаем запуск бота…"}</Text></View>
    <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="0000" placeholderTextColor={colors.muted} style={[styles.code, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />
    <Text style={[styles.hint, { color: colors.muted }]}>Код действует: {expiresText}</Text>
    <Pressable disabled={!linked || code.length !== 4 || verify.isPending} onPress={() => verify.mutate({ challengeId, code })} style={[styles.primary, { backgroundColor: linked && code.length === 4 ? colors.primary : colors.border }]}><Text style={[styles.primaryText, { color: linked && code.length === 4 ? "#FFF8F1" : colors.muted }]}>{verify.isPending ? "Проверяем…" : "Подтвердить и войти"}</Text></Pressable>
    {statusError ? <Text style={[styles.error, { color: colors.error }]}>{statusError.message}</Text> : null}
    {verify.error ? <Text style={[styles.error, { color: colors.error }]}>{verify.error.message}</Text> : null}
    <Pressable onPress={() => router.back()}><Text style={[styles.link, { color: colors.primary }]}>Изменить номер или способ</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 22, gap: 14, justifyContent: "center", flexGrow: 1 }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 31, fontWeight: "800" }, body: { fontSize: 14, lineHeight: 21 }, botButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, botButtonText: { fontSize: 14, fontWeight: "800" }, status: { minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14 }, dot: { width: 9, height: 9, borderRadius: 5 }, statusText: { fontSize: 13, fontWeight: "700" }, code: { minHeight: 62, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 30, fontWeight: "800", letterSpacing: 12, textAlign: "center" }, hint: { fontSize: 12, textAlign: "center" }, primary: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" }, primaryText: { fontSize: 14, fontWeight: "800" }, error: { fontSize: 12, lineHeight: 18 }, link: { textAlign: "center", fontSize: 13, fontWeight: "800" } });

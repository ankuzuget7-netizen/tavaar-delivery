import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const fields = [
  ["name", "Название заведения", "Например, кафе «Саян»"],
  ["type", "Тип заведения", "Кафе, ресторан, пекарня"],
  ["address", "Адрес", "Город, улица, дом"],
  ["phone", "Телефон", "+7 (___) ___-__-__"],
  ["contact", "Контактное лицо", "Имя представителя"],
] as const;

type FormValues = Record<string, string>;

export default function PartnerApplyScreen() {
  const colors = useColors();
  const [values, setValues] = useState<FormValues>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const valid = fields.every(([key]) => values[key]?.trim());
  const submit = trpc.restaurantApplications.submit.useMutation({
    onSuccess: () => {
      setError(null);
      setSubmitted(true);
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  if (submitted) {
    return (
      <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.success}>
          <View style={[styles.successIcon, { backgroundColor: colors.success + "18" }]}>
            <Ionicons name="checkmark-circle" size={52} color={colors.success} />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Заявка отправлена</Text>
          <Text style={[styles.successBody, { color: colors.muted }]}>Статус заявки: «На проверке». Мы свяжемся с вами после проверки данных.</Text>
          <Pressable onPress={() => router.replace("/(tabs)")} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.primaryText}>Вернуться на главную</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const handleSubmit = () => {
    setError(null);
    submit.mutate({
      name: values.name.trim(),
      type: values.type.trim(),
      address: values.address.trim(),
      phone: values.phone.trim(),
      contact: values.contact.trim(),
      description: values.description?.trim() || undefined,
    });
  };

  return (
    <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>ПАРТНЁРАМ</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Подключить заведение</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Заполните заявку. До одобрения администрацией заведение не появится в каталоге.</Text>

        {fields.map(([key, label, placeholder]) => (
          <View key={key} style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
            <TextInput value={values[key] ?? ""} onChangeText={(value) => set(key, value)} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />
          </View>
        ))}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>О себе и заведении</Text>
          <TextInput multiline numberOfLines={4} value={values.description ?? ""} onChangeText={(value) => set("description", value)} placeholder="Коротко расскажите о заведении" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} />
        </View>

        {error ? (
          <View style={[styles.error, { backgroundColor: colors.error + "14" }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.foreground }]}>{error}</Text>
          </View>
        ) : null}
        <View style={[styles.disclaimer, { backgroundColor: colors.warning + "14" }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.warning} />
          <Text style={[styles.disclaimerText, { color: colors.foreground }]}>Заявка отправляется в базу платформы и получает статус «На проверке». Публичный каталог обновляется только после решения администратора.</Text>
        </View>
        <Pressable disabled={!valid || submit.isPending} onPress={handleSubmit} style={[styles.primaryButton, { backgroundColor: valid && !submit.isPending ? colors.primary : colors.border }]}>
          <Text style={[styles.primaryText, { color: valid && !submit.isPending ? "#FFF8F1" : colors.muted }]}>{submit.isPending ? "Отправляем…" : "Отправить заявку"}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 35, gap: 12 },
  back: { flexDirection: "row", gap: 7, alignItems: "center", marginBottom: 12 },
  backText: { fontSize: 14, fontWeight: "700" },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 30, lineHeight: 35, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 21, marginBottom: 8 },
  field: { gap: 7 },
  label: { fontSize: 13, fontWeight: "800" },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, fontSize: 15 },
  textarea: { minHeight: 110, paddingTop: 14, textAlignVertical: "top" },
  error: { padding: 13, borderRadius: 15, flexDirection: "row", gap: 9, alignItems: "flex-start" },
  errorText: { flex: 1, fontSize: 12, lineHeight: 18 },
  disclaimer: { padding: 13, borderRadius: 15, flexDirection: "row", gap: 9, alignItems: "flex-start", marginTop: 4 },
  disclaimerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryText: { fontSize: 15, fontWeight: "800" },
  success: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30, gap: 12 },
  successIcon: { width: 92, height: 92, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { fontSize: 25, fontWeight: "800", textAlign: "center" },
  successBody: { fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 310 },
});

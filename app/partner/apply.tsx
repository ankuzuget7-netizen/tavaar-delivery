import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const requiredFields = ["name", "contact", "phone", "address"] as const;
type FormValues = { name: string; contact: string; phone: string; address: string; description: string };

export default function PartnerApplyScreen() {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [formOffset, setFormOffset] = useState(0);
  const [values, setValues] = useState<FormValues>({ name: "", contact: "", phone: "", address: "", description: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof FormValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const valid = requiredFields.every((key) => values[key].trim().length > 0);
  const submit = trpc.restaurantApplications.submit.useMutation({
    onSuccess: () => { setError(null); setSubmitted(true); },
    onError: (mutationError) => setError(mutationError.message),
  });

  const handleSubmit = () => {
    setError(null);
    submit.mutate({
      name: values.name.trim(),
      type: "Точка питания",
      address: values.address.trim(),
      phone: values.phone.trim(),
      contact: values.contact.trim(),
      description: values.description.trim() || undefined,
    });
  };

  if (submitted) {
    return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><View style={styles.success}><View style={[styles.successIcon, { backgroundColor: colors.success + "18" }]}><Ionicons name="checkmark-circle" size={54} color={colors.success} /></View><Text style={[styles.successTitle, { color: colors.foreground }]}>Заявка отправлена!</Text><Text style={[styles.successBody, { color: colors.muted }]}>Мы получили ваши данные и свяжемся с вами в ближайшее время по указанному контакту. Поможем подключить заведение к Таваар Доставка.</Text><Pressable onPress={() => router.replace("/" as never)} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>Вернуться на главную</Text></Pressable></View></ScreenContainer>;
  }

  return <ScreenContainer style={[styles.screen, { backgroundColor: colors.background }]}><ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Назад</Text></Pressable>
    <View style={[styles.hero, { backgroundColor: colors.primary }]}><View style={[styles.heroIcon, { backgroundColor: "#F1C67A22" }]}><Ionicons name="storefront-outline" size={31} color="#F1C67A" /></View><Text style={styles.heroKicker}>ПАРТНЁРАМ</Text><Text style={styles.heroTitle}>Подключите ваше заведение к Таваар Доставка</Text><Text style={styles.heroBody}>Единая площадка для приёма заказов в городе. Размещайте меню, привлекайте новых клиентов и получайте заказы через удобное приложение.</Text><Pressable onPress={() => scrollRef.current?.scrollTo({ y: formOffset, animated: true })} style={styles.heroButton}><Text style={[styles.heroButtonText, { color: colors.primary }]}>Оставить заявку</Text><Ionicons name="arrow-down" size={17} color={colors.primary} /></Pressable></View>
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Кому подходит площадка</Text>
    <View style={styles.cards}><InfoCard icon="restaurant-outline" title="Рестораны, кафе и кофейни" colors={colors} /><InfoCard icon="fast-food-outline" title="Бургерные, пиццерии и суши-бары" colors={colors} /><InfoCard icon="flame-outline" title="Фастфуд, стритфуд и локальные кухни" colors={colors} /></View>
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Как стать партнёром</Text>
    <View style={styles.steps}><Step number="1" title="Оставьте заявку" body="Заполните короткую форму с названием заведения и контактом для связи." colors={colors} /><Step number="2" title="Настроим профиль и меню" body="Поможем загрузить позиции, цены, фото блюд и подключить управление заказами." colors={colors} /><Step number="3" title="Принимайте заказы" body="Заведение появится в каталоге, и клиенты смогут оформлять заказы." colors={colors} /></View>
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Заявка на подключение</Text>
    <View onLayout={(event) => setFormOffset(event.nativeEvent.layout.y)} style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Field label="Название заведения *" placeholder="Например, кафе «Саян»" value={values.name} onChangeText={(value) => set("name", value)} colors={colors} />
      <Field label="Имя и должность / роль *" placeholder="Например, Ян, владелец" value={values.contact} onChangeText={(value) => set("contact", value)} colors={colors} />
      <Field label="Телефон или контакт в MAX / Telegram *" placeholder="+7 900 000-00-00 или @username" value={values.phone} onChangeText={(value) => set("phone", value)} colors={colors} keyboardType="phone-pad" />
      <Field label="Населённый пункт / адрес *" placeholder="Ак-Довурак, улица, дом" value={values.address} onChangeText={(value) => set("address", value)} colors={colors} />
      <Field label="Ссылка на меню, соцсети или комментарий" placeholder="Ссылка или дополнительная информация" value={values.description} onChangeText={(value) => set("description", value)} colors={colors} multiline />
      {error ? <View style={[styles.error, { backgroundColor: colors.error + "14" }]}><Ionicons name="alert-circle-outline" size={20} color={colors.error} /><Text style={[styles.errorText, { color: colors.foreground }]}>{error}</Text></View> : null}
      <Text style={[styles.formHint, { color: colors.muted }]}>Заявка попадёт в админ-панель. После проверки мы свяжемся с вами по указанному контакту.</Text>
      <Pressable disabled={!valid || submit.isPending} onPress={handleSubmit} style={[styles.primaryButton, { backgroundColor: valid && !submit.isPending ? colors.primary : colors.border }]}><Text style={[styles.primaryText, { color: valid && !submit.isPending ? "#FFF8F1" : colors.muted }]}>{submit.isPending ? "Отправляем…" : "Отправить заявку"}</Text></Pressable>
    </View>
    <Text style={[styles.footerNote, { color: colors.muted }]}>Обычно мы отвечаем после проверки данных и уточнения деталей подключения.</Text>
  </ScrollView></ScreenContainer>;
}

function Field({ label, colors, multiline, ...props }: { label: string; colors: ReturnType<typeof useColors>; multiline?: boolean } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.textarea, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /></View>; }
function InfoCard({ icon, title, colors }: { icon: keyof typeof Ionicons.glyphMap; title: string; colors: ReturnType<typeof useColors> }) { return <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.infoIcon, { backgroundColor: colors.primary + "14" }]}><Ionicons name={icon} size={22} color={colors.primary} /></View><Text style={[styles.infoTitle, { color: colors.foreground }]}>{title}</Text></View>; }
function Step({ number, title, body, colors }: { number: string; title: string; body: string; colors: ReturnType<typeof useColors> }) { return <View style={styles.step}><View style={[styles.stepNumber, { backgroundColor: colors.primary }]}><Text style={styles.stepNumberText}>{number}</Text></View><View style={{ flex: 1 }}><Text style={[styles.stepTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.stepBody, { color: colors.muted }]}>{body}</Text></View></View>; }

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 42, gap: 14 }, back: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 }, backText: { fontSize: 14, fontWeight: "800" }, hero: { borderRadius: 28, padding: 22, gap: 10, marginTop: 2 }, heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 2 }, heroKicker: { color: "#F1C67A", fontSize: 10, fontWeight: "900", letterSpacing: 1.7 }, heroTitle: { color: "#FFF8F1", fontSize: 28, lineHeight: 32, fontWeight: "900", letterSpacing: -0.6 }, heroBody: { color: "#FFF8F1CC", fontSize: 14, lineHeight: 20 }, heroButton: { minHeight: 46, borderRadius: 14, backgroundColor: "#FFF8F1", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start", marginTop: 4 }, heroButtonText: { fontSize: 14, fontWeight: "900" }, sectionTitle: { fontSize: 21, fontWeight: "900", marginTop: 4 }, cards: { gap: 9 }, infoCard: { minHeight: 72, borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }, infoIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" }, infoTitle: { flex: 1, fontSize: 14, fontWeight: "800", lineHeight: 19 }, steps: { gap: 14 }, step: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, stepNumber: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center" }, stepNumberText: { color: "#FFF8F1", fontSize: 15, fontWeight: "900" }, stepTitle: { fontSize: 15, fontWeight: "900", marginBottom: 3 }, stepBody: { fontSize: 13, lineHeight: 19 }, form: { borderWidth: 1, borderRadius: 22, padding: 15, gap: 12 }, field: { gap: 6 }, label: { fontSize: 13, fontWeight: "800" }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 }, textarea: { minHeight: 90, textAlignVertical: "top" }, formHint: { fontSize: 12, lineHeight: 18 }, error: { padding: 12, borderRadius: 13, flexDirection: "row", gap: 8, alignItems: "flex-start" }, errorText: { flex: 1, fontSize: 12, lineHeight: 18 }, primaryButton: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }, primaryText: { fontSize: 14, fontWeight: "900" }, footerNote: { textAlign: "center", fontSize: 12, lineHeight: 18, paddingHorizontal: 10 }, success: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30, gap: 13 }, successIcon: { width: 92, height: 92, borderRadius: 32, alignItems: "center", justifyContent: "center" }, successTitle: { fontSize: 26, fontWeight: "900", textAlign: "center" }, successBody: { fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 340 },});

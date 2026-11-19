import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

export function TavaarBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.lockup, compact ? styles.compact : styles.full]} accessibilityLabel="Таваар Доставка">
      <View style={[styles.mark, compact ? styles.compactMark : styles.fullMark]}>
        <Ionicons name="home-outline" size={compact ? 23 : 38} color="#F1C67A" />
      </View>
      <Text style={[styles.name, compact ? styles.compactName : styles.fullName]}>ТАВААР</Text>
      <Text style={[styles.delivery, compact ? styles.compactDelivery : styles.fullDelivery]}>ДОСТАВКА</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: "center", alignSelf: "flex-start" },
  full: { padding: 18, borderRadius: 24, backgroundColor: "#6B151C" },
  compact: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 16, backgroundColor: "#6B151C" },
  mark: { alignItems: "center", justifyContent: "center", borderColor: "#F1C67A" },
  fullMark: { width: 68, height: 54, borderWidth: 2, borderRadius: 34, marginBottom: 7 },
  compactMark: { width: 34, height: 28, borderWidth: 1.2, borderRadius: 17, marginBottom: 2 },
  name: { color: "#FFF8F1", fontWeight: "900", letterSpacing: 1.6 },
  fullName: { fontSize: 24 },
  compactName: { fontSize: 10, letterSpacing: 0.8 },
  delivery: { color: "#F1C67A", fontWeight: "800", letterSpacing: 2.2 },
  fullDelivery: { fontSize: 10, marginTop: 1 },
  compactDelivery: { fontSize: 5.5, letterSpacing: 1.1 },
});

import { Image, StyleSheet, View } from "react-native";

const logo = require("@/assets/images/tavaar-logo-reference.png");

export function TavaarBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.plate, compact ? styles.compactPlate : styles.fullPlate]}>
      <Image source={logo} resizeMode="contain" style={styles.logo} accessibilityLabel="Таваар Доставка" />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { overflow: "hidden", backgroundColor: "#6B151C", borderRadius: 26, alignSelf: "flex-start" },
  fullPlate: { width: 190, height: 230 },
  compactPlate: { width: 94, height: 116, borderRadius: 20 },
  logo: { width: "100%", height: "100%" },
});

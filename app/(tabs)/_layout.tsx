import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { paddingTop: 9, paddingBottom: bottomPadding, height: 60 + bottomPadding, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, elevation: 12, shadowColor: colors.primary, shadowOpacity: 0.08, shadowRadius: 14 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "900" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Главная", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="cart" options={{ title: "Корзина", tabBarIcon: ({ color, size }) => <Ionicons name="bag-handle" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Заказы", tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }} />
      <Tabs.Screen name="support" options={{ title: "Помощь", tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
    </Tabs>
  );
}

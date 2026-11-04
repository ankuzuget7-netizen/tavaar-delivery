import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export type CartItem = {
  menuItemId: number;
  restaurantId: number;
  restaurantName: string;
  name: string;
  description?: string | null;
  priceKopecks: number;
  prepMinutes: number;
  quantity: number;
};

type CustomerState = {
  cart: CartItem[];
  favorites: number[];
  cartRestaurantId: number | null;
  cartTotalKopecks: number;
  cartCount: number;
  hydrated: boolean;
  addToCart: (item: CartItem) => void;
  setCartQuantity: (menuItemId: number, quantity: number) => void;
  removeFromCart: (menuItemId: number) => void;
  clearCart: () => void;
  toggleFavorite: (restaurantId: number) => void;
  isFavorite: (restaurantId: number) => boolean;
};

const CustomerStateContext = createContext<CustomerState | null>(null);
const CART_KEY = "akdovurak.cart.v1";
const FAVORITES_KEY = "akdovurak.favorites.v1";

export function CustomerStateProvider({ children }: PropsWithChildren) {
  const colors = useColors();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pendingItem, setPendingItem] = useState<CartItem | null>(null);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(CART_KEY), AsyncStorage.getItem(FAVORITES_KEY)]).then(([savedCart, savedFavorites]) => {
      try { if (savedCart) setCart(JSON.parse(savedCart)); } catch { setCart([]); }
      try { if (savedFavorites) setFavorites(JSON.parse(savedFavorites)); } catch { setFavorites([]); }
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, []);

  useEffect(() => { if (hydrated) void AsyncStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart, hydrated]);
  useEffect(() => { if (hydrated) void AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }, [favorites, hydrated]);

  const addToCart = useCallback((item: CartItem) => {
    if (cart.length > 0 && cart[0].restaurantId !== item.restaurantId) {
      setPendingItem(item);
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.menuItemId === item.menuItemId);
      if (existing) return current.map((line) => line.menuItemId === item.menuItemId ? { ...line, quantity: Math.min(99, line.quantity + item.quantity) } : line);
      return [...current, item];
    });
  }, [cart]);

  const replaceCart = () => {
    if (pendingItem) setCart([pendingItem]);
    setPendingItem(null);
  };

  const value = useMemo<CustomerState>(() => ({
    cart,
    favorites,
    cartRestaurantId: cart[0]?.restaurantId ?? null,
    cartTotalKopecks: cart.reduce((sum, item) => sum + item.priceKopecks * item.quantity, 0),
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    hydrated,
    addToCart,
    setCartQuantity: (menuItemId, quantity) => setCart((current) => quantity <= 0 ? current.filter((item) => item.menuItemId !== menuItemId) : current.map((item) => item.menuItemId === menuItemId ? { ...item, quantity: Math.min(99, quantity) } : item)),
    removeFromCart: (menuItemId) => setCart((current) => current.filter((item) => item.menuItemId !== menuItemId)),
    clearCart: () => setCart([]),
    toggleFavorite: (restaurantId) => setFavorites((current) => current.includes(restaurantId) ? current.filter((id) => id !== restaurantId) : [...current, restaurantId]),
    isFavorite: (restaurantId) => favorites.includes(restaurantId),
  }), [addToCart, cart, favorites, hydrated]);

  return <CustomerStateContext.Provider value={value}>
    {children}
    <Modal visible={Boolean(pendingItem)} transparent animationType="fade" onRequestClose={() => setPendingItem(null)}>
      <View style={styles.backdrop}><View style={[styles.dialog, { backgroundColor: colors.surface }]}>
        <Text style={[styles.dialogTitle, { color: colors.foreground }]}>Сменить заведение?</Text>
        <Text style={[styles.dialogBody, { color: colors.muted }]}>В вашей корзине уже есть блюда другого заведения. Очистить корзину и добавить новый заказ?</Text>
        <View style={styles.actions}><Pressable onPress={() => setPendingItem(null)} style={[styles.cancel, { borderColor: colors.border }]}><Text style={[styles.cancelText, { color: colors.foreground }]}>Отмена</Text></Pressable><Pressable onPress={replaceCart} style={[styles.confirm, { backgroundColor: colors.primary }]}><Text style={styles.confirmText}>Очистить корзину и продолжить</Text></Pressable></View>
      </View></View>
    </Modal>
  </CustomerStateContext.Provider>;
}

export function useCustomerState() {
  const value = useContext(CustomerStateContext);
  if (!value) throw new Error("useCustomerState must be used inside CustomerStateProvider");
  return value;
}

const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: "#160B0870", justifyContent: "center", padding: 22 }, dialog: { borderRadius: 24, padding: 20, gap: 13 }, dialogTitle: { fontSize: 22, fontWeight: "800" }, dialogBody: { fontSize: 14, lineHeight: 21 }, actions: { flexDirection: "row", gap: 9, alignItems: "stretch", marginTop: 4 }, cancel: { flex: 1, minHeight: 48, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, cancelText: { fontSize: 12, fontWeight: "800" }, confirm: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, confirmText: { color: "#FFF8F1", fontSize: 12, fontWeight: "800", textAlign: "center" } });

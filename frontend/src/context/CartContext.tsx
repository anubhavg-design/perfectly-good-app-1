import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CartItem = {
  itemId: string;
  name: string;
  price: number;
  originalPrice: number;
  imageUrl: string;
  maxQty: number; // 0 = unlimited (takeaway/dine-in)
  quantity: number;
  note?: string;
};

export type Cart = {
  vendorId: string;
  vendorName: string;
  orderType: string; // surplus | takeaway | dine_in
  isOpen: boolean;
  openStatusText: string;
  todayShifts: { start: string; end: string }[];
  items: CartItem[];
};

export type AddMeta = {
  vendorId: string;
  vendorName: string;
  orderType: string;
  isOpen: boolean;
  openStatusText: string;
  todayShifts: { start: string; end: string }[];
  item: Omit<CartItem, 'quantity'>;
  quantity?: number;
};

type AddResult = { ok: true } | { ok: false; conflict: true; vendorName: string; sameVendor: boolean };

type CartContextType = {
  cart: Cart | null;
  itemCount: number;
  subtotal: number;
  addItem: (meta: AddMeta) => AddResult;
  replaceWithItem: (meta: AddMeta) => void;
  updateQty: (itemId: string, quantity: number) => void;
  updateNote: (itemId: string, note: string) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = 'pg_cart_v1';

const ORDER_LABELS: Record<string, string> = { surplus: 'Surplus', takeaway: 'Takeaway', dine_in: 'Dine-in' };
export const orderTypeLabel = (t: string) => ORDER_LABELS[t] || 'Surplus';

function buildCart(meta: AddMeta): Cart {
  const qty = Math.max(1, meta.quantity || 1);
  return {
    vendorId: meta.vendorId,
    vendorName: meta.vendorName,
    orderType: meta.orderType,
    isOpen: meta.isOpen,
    openStatusText: meta.openStatusText,
    todayShifts: meta.todayShifts || [],
    items: [{ ...meta.item, quantity: qty }],
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setCart(JSON.parse(raw));
      } catch {}
      hydrated.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    (async () => {
      try {
        if (cart && cart.items.length > 0) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        else await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {}
    })();
  }, [cart]);

  const clampQty = (it: CartItem): CartItem =>
    it.maxQty && it.maxQty > 0 ? { ...it, quantity: Math.min(it.quantity, it.maxQty) } : it;

  const addItem = (meta: AddMeta): AddResult => {
    const qty = Math.max(1, meta.quantity || 1);
    if (cart && cart.items.length > 0) {
      const conflict = cart.vendorId !== meta.vendorId || cart.orderType !== meta.orderType;
      if (conflict) {
        return { ok: false, conflict: true, vendorName: cart.vendorName, sameVendor: cart.vendorId === meta.vendorId };
      }
      // Same vendor + type: merge
      setCart((prev) => {
        if (!prev) return buildCart(meta);
        const items = [...prev.items];
        const idx = items.findIndex((i) => i.itemId === meta.item.itemId);
        if (idx >= 0) {
          items[idx] = clampQty({ ...items[idx], quantity: items[idx].quantity + qty, note: meta.item.note ?? items[idx].note });
        } else {
          items.push(clampQty({ ...meta.item, quantity: qty }));
        }
        // Refresh open status / shifts from latest meta
        return { ...prev, isOpen: meta.isOpen, openStatusText: meta.openStatusText, todayShifts: meta.todayShifts || prev.todayShifts, items };
      });
      return { ok: true };
    }
    setCart(buildCart(meta));
    return { ok: true };
  };

  const replaceWithItem = (meta: AddMeta) => setCart(buildCart(meta));

  const updateQty = (itemId: string, quantity: number) => {
    setCart((prev) => {
      if (!prev) return prev;
      let items = prev.items.map((i) => (i.itemId === itemId ? clampQty({ ...i, quantity }) : i));
      items = items.filter((i) => i.quantity > 0);
      if (items.length === 0) return null;
      return { ...prev, items };
    });
  };

  const removeItem = (itemId: string) => {
    setCart((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((i) => i.itemId !== itemId);
      if (items.length === 0) return null;
      return { ...prev, items };
    });
  };

  const updateNote = (itemId: string, note: string) => {
    setCart((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((i) => (i.itemId === itemId ? { ...i, note } : i)) };
    });
  };

  const clearCart = () => setCart(null);

  const itemCount = cart ? cart.items.reduce((s, i) => s + i.quantity, 0) : 0;
  const subtotal = cart ? Math.round(cart.items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100 : 0;

  return (
    <CartContext.Provider value={{ cart, itemCount, subtotal, addItem, replaceWithItem, updateQty, updateNote, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

import { useCallback, useEffect, useState } from 'react';
import { shopApi, type ShopCartItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface CartState {
  items: ShopCartItem[];
  subtotal: number;
  count: number;
  loading: boolean;
  error: string | null;
}

const listeners = new Set<() => void>();
let cache: CartState = { items: [], subtotal: 0, count: 0, loading: false, error: null };

function notify() {
  listeners.forEach(l => l());
}

async function fetchCart() {
  cache = { ...cache, loading: true, error: null };
  notify();
  try {
    const res = await shopApi.getCart();
    const data = res.data || { items: [], subtotal: 0, count: 0 };
    cache = {
      items: data.items || [],
      subtotal: Number(data.subtotal) || 0,
      count: data.count || 0,
      loading: false,
      error: null,
    };
  } catch (e) {
    const err = e as { message?: string };
    cache = { ...cache, loading: false, error: err.message || 'Failed to load cart' };
  }
  notify();
}

/**
 * Server-backed shopping cart. Cart lives in shop_cart_items table so it
 * survives logout/login and works across devices.
 */
export function useShopCart() {
  const { isAuthenticated, user } = useAuth();
  const [, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'client') {
      fetchCart();
    } else {
      cache = { items: [], subtotal: 0, count: 0, loading: false, error: null };
      notify();
    }
  }, [isAuthenticated, user?.role, user?.id]);

  const setQuantity = useCallback(async (productId: string, quantity: number) => {
    await shopApi.addToCart(productId, quantity);
    await fetchCart();
  }, []);

  const remove = useCallback(async (productId: string) => {
    await shopApi.removeFromCart(productId);
    await fetchCart();
  }, []);

  const refresh = useCallback(() => fetchCart(), []);

  return { ...cache, setQuantity, remove, refresh };
}
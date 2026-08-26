import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './client';

// Phase 3: remote config. Fetched at boot in the background; never blocks first paint.
// Persisted in AsyncStorage so the app has a warm answer even offline.

export type ClientConfig = {
  use_v2_lists: boolean;
  cache_ttl_seconds: number;
  min_supported_version: string;
  server_time: string;
};

const STORAGE_KEY = 'pg_config_v1';

// SAFE DEFAULT — v1. Any failure path returns this shape.
const DEFAULT_CONFIG: ClientConfig = {
  use_v2_lists: false,
  cache_ttl_seconds: 300,
  min_supported_version: '1.0.0',
  server_time: '',
};

// In-memory copy so hot code paths (adapter dispatch) never touch AsyncStorage.
let inMemory: ClientConfig = { ...DEFAULT_CONFIG };
let lastFetchedAt = 0;
let hydrated = false;
const listeners = new Set<(c: ClientConfig) => void>();

function emit() {
  for (const fn of listeners) {
    try { fn(inMemory); } catch {}
  }
}

async function hydrateFromStorage(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        inMemory = { ...DEFAULT_CONFIG, ...parsed };
      }
    }
  } catch {}
  hydrated = true;
}

async function persist(cfg: ClientConfig): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}

export function getConfigSync(): ClientConfig {
  return inMemory;
}

/** Force a network refresh. Never throws. Never blocks longer than ~6s. */
export async function refreshConfig(): Promise<ClientConfig> {
  await hydrateFromStorage();
  try {
    const remote = await Promise.race([
      apiFetch('/config'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ]) as any;
    if (remote && typeof remote === 'object' && typeof remote.use_v2_lists === 'boolean') {
      inMemory = { ...DEFAULT_CONFIG, ...remote };
      lastFetchedAt = Date.now();
      await persist(inMemory);
      emit();
    }
  } catch (e) {
    // Silent — keep whatever we have (persisted or default). NEVER crash boot on config failure.
  }
  return inMemory;
}

/** Called once on app start. Fires refresh in the background; returns immediately. */
export async function initConfig(): Promise<ClientConfig> {
  await hydrateFromStorage();
  // Background refresh — do not await.
  refreshConfig().catch(() => {});
  // Foreground refresh on app-state change (respecting cache_ttl).
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state !== 'active') return;
    const ttlMs = Math.max(30, inMemory.cache_ttl_seconds) * 1000;
    if (Date.now() - lastFetchedAt >= ttlMs) {
      refreshConfig().catch(() => {});
    }
  });
  return inMemory;
}

/** React hook — returns current config, re-renders when refresh completes. */
export function useConfig(): ClientConfig {
  const [c, setC] = React.useState<ClientConfig>(inMemory);
  React.useEffect(() => {
    const fn = (nc: ClientConfig) => setC(nc);
    listeners.add(fn);
    // Kick off a lazy hydrate if the component mounted before initConfig().
    hydrateFromStorage().then(() => setC(inMemory));
    return () => { listeners.delete(fn); };
  }, []);
  return c;
}

// Test-only helpers. Never call from app code.
export const _testing = {
  reset() { inMemory = { ...DEFAULT_CONFIG }; lastFetchedAt = 0; hydrated = false; listeners.clear(); },
  setInMemory(c: Partial<ClientConfig>) { inMemory = { ...inMemory, ...c }; emit(); },
};

import AsyncStorage from '@react-native-async-storage/async-storage';

// Phase 3: stable per-device UUID used for backend rollout bucketing when
// the user isn't logged in. Generated once, persisted forever (or until app data is cleared).
const KEY = 'pg_client_id_v1';
let cached: string | null = null;

// RFC-4122-ish v4 UUID. We don't need cryptographic strength — this is
// a rollout-bucket key, not a security token.
function uuidv4(): string {
  const rand = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  const a = rand();
  const b = rand();
  const c = rand();
  const d = rand();
  // set version=4 nibble and variant=10xx nibble to keep RFC-4122 shape
  const b1 = (parseInt(b.slice(0, 4), 16) & 0x0fff | 0x4000).toString(16).padStart(4, '0');
  const c1 = (parseInt(c.slice(0, 4), 16) & 0x3fff | 0x8000).toString(16).padStart(4, '0');
  return `${a}-${b.slice(4)}-${b1}-${c1}-${c.slice(4)}${d}`;
}

export async function getClientId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored && stored.length >= 8) {
      cached = stored;
      return stored;
    }
  } catch {}
  const fresh = uuidv4();
  try { await AsyncStorage.setItem(KEY, fresh); } catch {}
  cached = fresh;
  return fresh;
}

// Test-only escape hatch. Never call in app code.
export function _resetForTest() { cached = null; }

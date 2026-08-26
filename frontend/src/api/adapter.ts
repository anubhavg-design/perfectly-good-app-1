import { apiFetch } from './client';
import { getConfigSync } from './config';
import { dropsApi, restaurantsApi } from './client';

// Phase 3: unified paginated fetcher. All list screens go through this.
//
// v1 responses are BARE arrays. The adapter wraps them into Page<T> and
// synthesizes an opaque cursor from the offset it just used. v2 responses
// arrive as { items, next_cursor, has_more } and pass through untouched.
//
// With use_v2_lists=false, the underlying network call is byte-identical to
// what the 1.0.2 client sent (same v1 URL, same query params, same limit/offset).

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type FetchArgs = {
  limit: number;
  cursor: string | null;
  params: Record<string, any>;
};

// ── Opaque cursor for v1's offset ───────────────────────────────────────
type V1Cursor = { m: 'v1'; o: number };

function encodeV1Cursor(offset: number): string {
  // Base64-of-JSON. Same shape as v2 cursors so screens can't tell them apart.
  const json = JSON.stringify({ m: 'v1', o: offset });
  // React Native has btoa via global, but be defensive.
  if (typeof btoa === 'function') return btoa(json).replace(/=+$/, '');
  // Node fallback (used by tests).
  return Buffer.from(json, 'utf-8').toString('base64').replace(/=+$/, '');
}

function decodeV1Cursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const padded = cursor + '='.repeat((4 - (cursor.length % 4)) % 4);
    const json = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (parsed && parsed.m === 'v1' && Number.isFinite(parsed.o)) return parsed.o;
  } catch {}
  return 0;
}

function buildQueryString(params: Record<string, any>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── v2 envelope pass-through ────────────────────────────────────────────
async function fetchV2Page(path: string, args: FetchArgs): Promise<Page<any>> {
  const params: Record<string, any> = { ...args.params, limit: args.limit };
  if (args.cursor) params.cursor = args.cursor;
  const res = await apiFetch(`${path}${buildQueryString(params)}`);
  return {
    items: Array.isArray(res?.items) ? res.items : [],
    nextCursor: res?.next_cursor ?? null,
    hasMore: !!res?.has_more,
  };
}

// ── Adapter surface (all list screens call these four) ──────────────────

/** Restaurants list (home tab, top of page). */
export const restaurants = {
  async list(args: FetchArgs): Promise<Page<any>> {
    if (getConfigSync().use_v2_lists) {
      return fetchV2Page('/v2/restaurants', args);
    }
    const offset = decodeV1Cursor(args.cursor);
    const list = (await restaurantsApi.list({
      ...args.params,
      limit: args.limit,
      offset,
    })) || [];
    const hasMore = list.length === args.limit;
    return {
      items: list,
      nextCursor: hasMore ? encodeV1Cursor(offset + args.limit) : null,
      hasMore,
    };
  },
};

/** Surplus deals rail + full surplus screen. */
export const drops = {
  async list(args: FetchArgs): Promise<Page<any>> {
    if (getConfigSync().use_v2_lists) {
      return fetchV2Page('/v2/drops', args);
    }
    // v1 /drops has no offset param; it returns up to 500 sorted items.
    // We slice client-side to match the adapter contract (byte-identical URL).
    const offset = decodeV1Cursor(args.cursor);
    const full = (await dropsApi.list(args.params)) || [];
    const page = full.slice(offset, offset + args.limit);
    const hasMore = offset + args.limit < full.length;
    return {
      items: page,
      nextCursor: hasMore ? encodeV1Cursor(offset + args.limit) : null,
      hasMore,
    };
  },
};

/** Browse-deals infinite scroll. */
export const browseDeals = {
  async list(args: FetchArgs): Promise<Page<any>> {
    if (getConfigSync().use_v2_lists) {
      return fetchV2Page('/v2/browse-deals', args);
    }
    const offset = decodeV1Cursor(args.cursor);
    const list = (await restaurantsApi.browseDeals({
      ...args.params,
      limit: args.limit,
      offset,
    })) || [];
    const hasMore = list.length === args.limit;
    return {
      items: list,
      nextCursor: hasMore ? encodeV1Cursor(offset + args.limit) : null,
      hasMore,
    };
  },
};

/** Featured deals rail (single page, no pagination on either v1 or v2). */
export const featuredDeals = {
  async list(args: FetchArgs): Promise<Page<any>> {
    if (getConfigSync().use_v2_lists) {
      return fetchV2Page('/v2/featured-deals', args);
    }
    const list = (await restaurantsApi.featuredDeals(args.params)) || [];
    return { items: list, nextCursor: null, hasMore: false };
  },
};

// Exposed for tests.
export const _cursor = { encodeV1Cursor, decodeV1Cursor };

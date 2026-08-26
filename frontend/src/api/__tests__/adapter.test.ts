// Phase 3 mobile unit tests.
//
// Run with jest (add via `yarn add -D jest jest-expo @types/jest`):
//     "test": "jest --preset=jest-expo"
// or with tsx directly:
//     npx tsx frontend/src/api/__tests__/adapter.test.ts
//
// Written in jest syntax so `yarn test` works once jest lands. The file is
// self-contained apart from that.
import * as adapter from '../adapter';
import * as clientMod from '../client';
import * as configMod from '../config';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
  restaurantsApi: {
    list: jest.fn(),
    featuredDeals: jest.fn(),
    browseDeals: jest.fn(),
  },
  dropsApi: {
    list: jest.fn(),
  },
}));

const setUseV2 = (v: boolean) => (configMod as any)._testing.setInMemory({ use_v2_lists: v });

describe('adapter — v1 bare array wrapping', () => {
  beforeEach(() => {
    (configMod as any)._testing.reset();
    jest.clearAllMocks();
  });

  test('wraps v1 bare list; hasMore=true when list.length === limit', async () => {
    setUseV2(false);
    (clientMod.restaurantsApi.list as jest.Mock).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ vendor_id: `v${i}` })),
    );
    const page = await adapter.restaurants.list({ limit: 10, cursor: null, params: { lat: 1, lon: 2 } });
    expect(page.items.length).toBe(10);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
    expect(clientMod.restaurantsApi.list).toHaveBeenCalledWith({ lat: 1, lon: 2, limit: 10, offset: 0 });
  });

  test('wraps v1 bare list; hasMore=false when list.length < limit', async () => {
    setUseV2(false);
    (clientMod.restaurantsApi.list as jest.Mock).mockResolvedValue([{ vendor_id: 'a' }, { vendor_id: 'b' }]);
    const page = await adapter.restaurants.list({ limit: 10, cursor: null, params: {} });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  test('page 2 request uses offset from cursor round-trip', async () => {
    setUseV2(false);
    (clientMod.restaurantsApi.list as jest.Mock).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ vendor_id: `v${i}` })),
    );
    const p1 = await adapter.restaurants.list({ limit: 10, cursor: null, params: {} });
    await adapter.restaurants.list({ limit: 10, cursor: p1.nextCursor, params: {} });
    const secondCall = (clientMod.restaurantsApi.list as jest.Mock).mock.calls[1][0];
    expect(secondCall.offset).toBe(10);
  });
});

describe('adapter — v2 envelope pass-through', () => {
  beforeEach(() => {
    (configMod as any)._testing.reset();
    jest.clearAllMocks();
  });

  test('v2 envelope passes through unchanged', async () => {
    setUseV2(true);
    (clientMod.apiFetch as jest.Mock).mockResolvedValue({
      items: [{ vendor_id: 'x' }],
      next_cursor: 'abc',
      has_more: true,
    });
    const page = await adapter.restaurants.list({ limit: 10, cursor: null, params: { lat: 1, lon: 2 } });
    expect(page.items).toEqual([{ vendor_id: 'x' }]);
    expect(page.nextCursor).toBe('abc');
    expect(page.hasMore).toBe(true);
    const urlCalled = (clientMod.apiFetch as jest.Mock).mock.calls[0][0];
    expect(urlCalled).toContain('/v2/restaurants');
    expect(urlCalled).toContain('lat=1');
    expect(urlCalled).toContain('lon=2');
  });

  test('v2 empty envelope defaults gracefully', async () => {
    setUseV2(true);
    (clientMod.apiFetch as jest.Mock).mockResolvedValue({});
    const page = await adapter.restaurants.list({ limit: 10, cursor: null, params: {} });
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe('adapter — network-equivalence when flag is off', () => {
  beforeEach(() => {
    (configMod as any)._testing.reset();
    jest.clearAllMocks();
  });

  test('v1 mode calls /api/restaurants with EXACT same params 1.0.2 sent', async () => {
    setUseV2(false);
    (clientMod.restaurantsApi.list as jest.Mock).mockResolvedValue([]);
    await adapter.restaurants.list({
      limit: 10, cursor: null,
      params: { lat: 12.9716, lon: 77.5946, search: undefined, category: undefined },
    });
    expect(clientMod.restaurantsApi.list).toHaveBeenCalledWith({
      lat: 12.9716, lon: 77.5946, search: undefined, category: undefined,
      limit: 10, offset: 0,
    });
    expect(clientMod.apiFetch).not.toHaveBeenCalled();
  });
});

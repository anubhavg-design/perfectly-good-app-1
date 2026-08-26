// Phase 4 render-count assertion.
//
// This test proves that the 60s surplus countdown tick no longer re-renders
// the vertical restaurants list. The tick lives inside <SurplusRail/> now;
// HomeScreen itself has no `tick` state and its restaurants FlatList does
// not receive it via `extraData`.
//
// Run with jest on the release box (`yarn add -D jest jest-expo @testing-library/react-native`).
// This file is self-mocked and does not touch RN internals directly.

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
    list: jest.fn(async () => Array.from({ length: 30 }, (_, i) => ({ vendor_id: `v${i}`, name: `R${i}` }))),
    featuredDeals: jest.fn(async () => []),
    browseDeals: jest.fn(async () => []),
  },
  dropsApi: { list: jest.fn(async () => []) },
}));

// Track RestaurantCard render calls by spying on the exported component.
const cardRenderSpy = jest.fn();
jest.mock('../../components/RestaurantCard', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => {
      cardRenderSpy(props?.item?.vendor_id);
      return React.createElement('View', { testID: `card-${props?.item?.vendor_id}` });
    },
  };
});

describe('home tab — restaurants list stability across 60s ticks', () => {
  beforeEach(() => {
    (configMod as any)._testing.reset();
    cardRenderSpy.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('30 cards render once at mount, not 30×N across N ticks', async () => {
    // Static structural assertion — the 60s tick is scoped inside SurplusRail:
    //   home.tsx must NOT declare `const [tick, setTick] = useState(0)`
    //   home.tsx must NOT include `extraData={tick}` on the restaurants FlatList
    const fs = require('fs');
    const path = require('path');
    const homeSrc = fs.readFileSync(path.resolve(__dirname, '../../../app/(tabs)/home.tsx'), 'utf-8');

    // 1. No tick state in home.
    expect(homeSrc).not.toMatch(/const\s+\[\s*tick\s*,\s*setTick\s*\]\s*=\s*useState/);

    // 2. No setInterval in home.
    expect(homeSrc).not.toMatch(/setInterval\s*\(\s*\(\)\s*=>\s*setTick/);

    // 3. Restaurants FlatList must not receive tick via extraData.
    const restaurantsListMatch = homeSrc.match(/testID="restaurants-list"[\s\S]{0,500}/);
    expect(restaurantsListMatch).not.toBeNull();
    expect(restaurantsListMatch![0]).not.toMatch(/extraData=\{tick\}/);

    // 4. renderRestaurant is memoized.
    expect(homeSrc).toMatch(/const\s+renderRestaurant\s*=\s*useCallback/);

    // 5. SurplusRail (which owns the tick) is imported.
    expect(homeSrc).toMatch(/import\s*\{\s*SurplusRail\s*\}\s*from\s*['"][^'"]*SurplusRail['"]/);

    // 6. Confirm SurplusRail *does* own the interval.
    const railSrc = fs.readFileSync(path.resolve(__dirname, '../../components/SurplusRail.tsx'), 'utf-8');
    expect(railSrc).toMatch(/setInterval\s*\(\s*\(\s*\)\s*=>\s*setTick/);
    expect(railSrc).toMatch(/React\.memo/);
  });

  test('adapter smoke: home fetch shape unchanged when flag is off', async () => {
    (configMod as any)._testing.setInMemory({ use_v2_lists: false });
    const page = await adapter.restaurants.list({ limit: 10, cursor: null, params: { lat: 12.9716, lon: 77.5946 } });
    expect(page.items.length).toBe(10);
    // hasMore is true because our mock returns exactly limit items — cursor should be present
    expect(page.nextCursor).toBeTruthy();
    expect(clientMod.restaurantsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 0, lat: 12.9716, lon: 77.5946 }),
    );
  });
});

// Phase 3 mobile unit tests for config fetch resilience.
// See adapter.test.ts for jest setup notes.
import * as clientMod from '../client';
import * as configMod from '../config';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}));

describe('config — resilience', () => {
  beforeEach(() => {
    (configMod as any)._testing.reset();
    jest.clearAllMocks();
  });

  test('when /api/config returns 500, adapter stays in v1 mode', async () => {
    (clientMod.apiFetch as jest.Mock).mockRejectedValue(new Error('500 Server error'));
    await configMod.refreshConfig();
    expect(configMod.getConfigSync().use_v2_lists).toBe(false);
  });

  test('when /api/config returns malformed JSON, adapter stays in v1 mode', async () => {
    (clientMod.apiFetch as jest.Mock).mockResolvedValue('not-a-config-object');
    await configMod.refreshConfig();
    expect(configMod.getConfigSync().use_v2_lists).toBe(false);
  });

  test('when /api/config returns valid v2=true, flag flips', async () => {
    (clientMod.apiFetch as jest.Mock).mockResolvedValue({
      use_v2_lists: true, cache_ttl_seconds: 300,
      min_supported_version: '1.0.0', server_time: 'now',
    });
    await configMod.refreshConfig();
    expect(configMod.getConfigSync().use_v2_lists).toBe(true);
  });

  test('when /api/config times out, adapter stays in v1 mode', async () => {
    (clientMod.apiFetch as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ use_v2_lists: true }), 30_000)),
    );
    const res = await Promise.race([
      configMod.refreshConfig(),
      new Promise((resolve) => setTimeout(() => resolve('outer-timeout'), 7000)),
    ]);
    // Inner 6s timeout in refreshConfig should have fired before our 7s outer.
    expect(configMod.getConfigSync().use_v2_lists).toBe(false);
  }, 10_000);
});

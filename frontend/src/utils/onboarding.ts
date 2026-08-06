import AsyncStorage from '@react-native-async-storage/async-storage';

// Device-local flag so the customer onboarding carousel is shown only once,
// on the very first login/registration, and never again on that device.
const KEY = (userId: string) => `pg_onboarded_v1_${userId || 'guest'}`;

export async function hasSeenOnboarding(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY(userId))) === '1';
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(userId), '1');
  } catch {
    // ignore storage failures; worst case the carousel shows again
  }
}

// Progress memory: remember the slide a customer stopped on so closing the app
// mid-intro resumes them on the same slide next open.
const PROGRESS_KEY = (userId: string) => `pg_onboarding_progress_${userId || 'guest'}`;

export async function saveOnboardingProgress(userId: string, index: number): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY(userId), String(index));
  } catch {}
}

export async function loadOnboardingProgress(userId: string): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(PROGRESS_KEY(userId));
    const n = v == null ? 0 : parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function clearOnboardingProgress(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY(userId));
  } catch {}
}

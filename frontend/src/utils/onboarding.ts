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

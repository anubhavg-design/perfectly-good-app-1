import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiFetch } from '../api/client';

// Returns the native device push token (FCM on Android, APNs on iOS), or null.
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Permission FIRST, then token
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return tokenData.data as string;
  } catch (err) {
    console.log('Failed to get push token', err);
    return null;
  }
}

// Registers the device token against the user via the Emergent push relay.
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    await apiFetch('/register-push', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: token,
      }),
    });
  } catch (err) {
    console.log('Failed to register push token', err);
  }
}

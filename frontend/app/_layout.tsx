import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, StyleSheet, Platform, Alert } from 'react-native';
import { COLORS } from '../src/constants/theme';

SplashScreen.preventAutoHideAsync();

// Foreground display behaviour — MODULE SCOPE (native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Android notification channel — MODULE SCOPE
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

function handlePushTap(response: Notifications.NotificationResponse | null, router: any) {
  if (!response) return;
  const data: any = response.notification.request.content.data || {};
  const url = data.deeplink || data.action_url;
  if (!url) return;
  if (typeof url === 'string' && url.startsWith('http')) {
    Linking.openURL(url);
  } else {
    router.push(url);
  }
}

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Warm tap — user taps a notification while the app is open
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handlePushTap(response, router);
    });

    // Cold-start tap — app was killed and launched by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      handlePushTap(response, router);
    });

    // Weekly nudge for users who permanently denied notifications
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== 'denied' || canAskAgain) return;
        const lastNudge = await AsyncStorage.getItem('pushNudgeAt');
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        Alert.alert(
          'Turn on notifications',
          'Enable notifications to get order confirmations, pickup reminders and fresh surplus deals.',
          [
            {
              text: 'Later',
              style: 'cancel',
              onPress: async () => {
                await AsyncStorage.setItem('pushNudgeAt', String(Date.now()));
              },
            },
            {
              text: 'Open Settings',
              onPress: async () => {
                await AsyncStorage.setItem('pushNudgeAt', String(Date.now()));
                Linking.openSettings();
              },
            },
          ],
        );
      } catch {}
    })();

    return () => {
      tapSub.remove();
    };
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="privacy-settings" />
        <Stack.Screen name="drop/[id]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="restaurant/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
        <Stack.Screen name="order-confirmation" options={{ gestureEnabled: false }} />
        <Stack.Screen name="admin" />
        <Stack.Screen name="vendor-create-drop" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="support/index" />
        <Stack.Screen name="support/[type]" />
        <Stack.Screen name="support/my-requests" />
        <Stack.Screen name="browse-deals" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});

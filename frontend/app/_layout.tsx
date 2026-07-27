import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
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
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../src/constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
        <Stack.Screen name="(tabs)" />
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

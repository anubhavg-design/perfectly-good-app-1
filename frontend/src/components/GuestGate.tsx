import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

interface Props {
  title: string;
  message: string;
  next?: string; // path to continue to after successful login
  testID?: string;
}

// Shown in place of a protected screen when the user is browsing as a guest.
export default function GuestGate({ title, message, next, testID }: Props) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']} testID={testID || 'guest-gate'}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Lock size={40} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity
          testID="guest-gate-signin"
          style={styles.btn}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/login', params: next ? { next } : {} })}
        >
          <Text style={styles.btnText}>Sign In or Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(tabs)/home')} style={styles.browseBtn}>
          <Text style={styles.browseText}>Keep browsing</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  title: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, textAlign: 'center', marginBottom: SPACING.sm },
  message: { fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 15, paddingHorizontal: SPACING.xl, alignSelf: 'stretch', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  browseBtn: { marginTop: SPACING.md, padding: SPACING.sm },
  browseText: { color: COLORS.primary, fontSize: 15, fontFamily: 'DMSans_700Bold' },
});

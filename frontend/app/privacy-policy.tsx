import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Shield } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../src/constants/theme';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="privacy-back-btn" onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <Shield size={32} color={COLORS.primary} />
        </View>

        <Text style={styles.lastUpdated}>Last updated: April 2026</Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.body}>
          We collect your name, email address, and location data to provide our surplus food marketplace service. Location data helps us show nearby food deals and is only accessed with your permission.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Data</Text>
        <Text style={styles.body}>
          Your information is used to: create and manage your account, process food reservations and payments, send order notifications, show nearby surplus food listings, and improve our service.
        </Text>

        <Text style={styles.sectionTitle}>3. Payment Information</Text>
        <Text style={styles.body}>
          Payments are processed securely through Razorpay. We do not store your card details. All payment data is handled directly by Razorpay under their security standards.
        </Text>

        <Text style={styles.sectionTitle}>4. Push Notifications</Text>
        <Text style={styles.body}>
          We send push notifications for new food listings, order updates, and pickup reminders. You can disable notifications in your device settings at any time.
        </Text>

        <Text style={styles.sectionTitle}>5. Data Sharing</Text>
        <Text style={styles.body}>
          We share your name with vendors only when you place an order, so they can identify pickups. We do not sell your data to third parties.
        </Text>

        <Text style={styles.sectionTitle}>6. Data Retention</Text>
        <Text style={styles.body}>
          Your account data is retained as long as your account is active. You can request account deletion by contacting us at privacy@perfectlygood.in.
        </Text>

        <Text style={styles.sectionTitle}>7. Your Rights</Text>
        <Text style={styles.body}>
          You have the right to access, correct, or delete your personal data. Contact us at privacy@perfectlygood.in for any data-related requests.
        </Text>

        <Text style={styles.sectionTitle}>8. Contact</Text>
        <Text style={styles.body}>
          For questions about this policy, contact us at:{'\n'}privacy@perfectlygood.in
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  iconWrap: { alignItems: 'center', marginBottom: SPACING.md },
  lastUpdated: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  body: { fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, lineHeight: 23 },
});

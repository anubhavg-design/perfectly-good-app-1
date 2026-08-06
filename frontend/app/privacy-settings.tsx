import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, FileText, Trash2, ShieldCheck } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { accountApi } from '../src/api/client';

export default function PrivacySettings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const isStaff = ['admin', 'operations', 'customer_success', 'finance'].includes((user as any)?.role);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await accountApi.deleteAccount();
      await logout().catch(() => {});
      Alert.alert('Account deleted', 'Your account and personal data have been permanently removed.');
      setTimeout(() => router.replace('/'), 100);
    } catch (e: any) {
      setDeleting(false);
      Alert.alert('Could not delete account', e.message || 'Please try again.');
    }
  };

  // Two-step confirmation before permanent, irreversible deletion (Apple 5.1.1(v)).
  const confirmDelete = () => {
    Alert.alert(
      'Delete Account',
      'Deleting your account is permanent and cannot be undone. Your profile, saved details, preferences and notification tokens will be removed. Past orders are kept for accounting but fully anonymised.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'This is your final confirmation. Your account and personal data will be permanently deleted and you will be signed out.',
              [
                { text: 'Keep my account', style: 'cancel' },
                { text: 'Delete permanently', style: 'destructive', onPress: doDelete },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="privacy-back" onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings & Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>PRIVACY</Text>

        <TouchableOpacity
          testID="privacy-policy-link"
          style={styles.row}
          onPress={() => router.push('/privacy-policy')}
          activeOpacity={0.8}
        >
          <View style={[styles.rowIcon, { backgroundColor: '#F0FDF4' }]}>
            <FileText size={20} color={COLORS.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Privacy Policy</Text>
            <Text style={styles.rowSub}>How we collect and handle your data</Text>
          </View>
          <ChevronRight size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <ShieldCheck size={18} color={COLORS.primary} />
          <Text style={styles.infoText}>
            You are always in control of your data. Deleting your account removes your personal
            information from our systems. Transaction records required for accounting are kept but
            anonymised so they can no longer be linked to you.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>DANGER ZONE</Text>

        {isStaff ? (
          <View style={styles.infoCard}>
            <ShieldCheck size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              Account deletion is disabled for staff accounts. Please contact your
              administrator to make changes to your account.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            testID="delete-account-btn"
            style={styles.deleteRow}
            onPress={confirmDelete}
            disabled={deleting}
            activeOpacity={0.85}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#FEF2F2' }]}>
              <Trash2 size={20} color={COLORS.error} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: COLORS.error }]}>Delete Account</Text>
              <Text style={styles.rowSub}>Permanently delete your account and data</Text>
            </View>
            {deleting ? <ActivityIndicator color={COLORS.error} /> : <ChevronRight size={20} color={COLORS.error} />}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  content: { padding: SPACING.md },
  sectionLabel: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.textMuted, letterSpacing: 0.6, marginBottom: SPACING.sm, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small },
  rowIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 16, fontFamily: 'DMSans_700Bold', color: COLORS.textPrimary },
  rowSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 2 },
  infoCard: { flexDirection: 'row', gap: SPACING.sm, backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.sm },
  infoText: { flex: 1, fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, lineHeight: 20 },
  deleteRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.error + '33', ...SHADOWS.small },
});

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User, Mail, Shield, LogOut, ChevronRight, Store, FileText } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          logout().finally(() => {
            setTimeout(() => {
              router.replace('/');
            }, 100);
          });
        },
      },
    ]);
  };

  if (!user) return null;

  const roleLabel = user.role === 'admin' ? 'Administrator' : user.role === 'vendor' ? 'Vendor' : 'Food Rescuer';
  const memberSince = new Date(user.created_at).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>Profile</Text>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user.name?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.userName}>{user.name}</Text>
          <View style={styles.roleBadge}>
            <Shield size={12} color={COLORS.primary} />
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
          <Text style={styles.memberSince}>Member since {memberSince}</Text>
        </View>

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Details</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Mail size={18} color={COLORS.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user.email}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <User size={18} color={COLORS.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>User ID</Text>
                <Text style={styles.infoValue}>{user.user_id}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          {user.role === 'admin' && (
            <TouchableOpacity
              testID="admin-panel-btn"
              style={styles.actionCard}
              onPress={() => router.push('/admin')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#EDE9FE' }]}>
                <Shield size={20} color="#7C3AED" />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Admin Panel</Text>
                <Text style={styles.actionSubtitle}>Manage vendors and menu items</Text>
              </View>
              <ChevronRight size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}

          {user.role === 'user' && (
            <View style={styles.becomeVendorCard}>
              <Store size={24} color={COLORS.primary} />
              <View style={styles.becomeVendorContent}>
                <Text style={styles.becomeVendorTitle}>Become a Vendor</Text>
                <Text style={styles.becomeVendorSub}>Contact us to list your surplus food</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            testID="privacy-policy-btn"
            style={styles.actionCard}
            onPress={() => router.push('/privacy-policy')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F0FDF4' }]}>
              <FileText size={20} color={COLORS.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Privacy Policy</Text>
              <Text style={styles.actionSubtitle}>How we handle your data</Text>
            </View>
            <ChevronRight size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          testID="logout-btn"
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <LogOut size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  screenTitle: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, marginBottom: SPACING.lg },
  profileCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center', ...SHADOWS.medium,
    marginBottom: SPACING.lg,
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatarText: { fontSize: 28, fontFamily: 'Outfit_700Bold', color: '#fff' },
  userName: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  roleText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.primary },
  memberSince: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
  infoValue: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.borderLight },
  actionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, ...SHADOWS.small, marginBottom: SPACING.sm,
  },
  actionIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  actionSubtitle: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  becomeVendorCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  becomeVendorContent: { flex: 1 },
  becomeVendorTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.primary },
  becomeVendorSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.error + '10', borderRadius: RADIUS.lg,
    padding: SPACING.md, marginTop: SPACING.md,
  },
  logoutText: { fontSize: 16, fontFamily: 'DMSans_700Bold', color: COLORS.error },
});

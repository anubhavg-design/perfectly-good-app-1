import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User, Mail, Shield, LogOut, ChevronRight, Store, FileText, LifeBuoy, Trash2, Sparkles, X } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { accountApi } from '../../src/api/client';

const VENDOR_CONTACT_EMAIL = 'chaitanya@perfectlygood.in';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [vendorModal, setVendorModal] = useState(false);
  const [vOwner, setVOwner] = useState('');
  const [vRestaurant, setVRestaurant] = useState('');
  const [vCity, setVCity] = useState('');
  const [vMobile, setVMobile] = useState('');

  const sendVendorEmail = async () => {
    if (!vOwner.trim() || !vRestaurant.trim() || !vCity.trim() || !vMobile.trim()) {
      Alert.alert('Missing details', 'Please fill in all fields so we can reach you.');
      return;
    }
    const subject = `Vendor Application - ${vRestaurant.trim()}`;
    const body =
      `Hi Perfectly Good Team,\n\n` +
      `I'd like to list my restaurant on Perfectly Good. Here are my details:\n\n` +
      `Owner Name: ${vOwner.trim()}\n` +
      `Restaurant Name: ${vRestaurant.trim()}\n` +
      `City: ${vCity.trim()}\n` +
      `Mobile Number: ${vMobile.trim()}\n\n` +
      `Please get in touch to help me get started.\n\nThanks!`;
    const url = `mailto:${VENDOR_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('No email app found', `Please email us at ${VENDOR_CONTACT_EMAIL} with your details.`);
        return;
      }
      await Linking.openURL(url);
      setVendorModal(false);
    } catch {
      Alert.alert('Could not open email', `Please email us at ${VENDOR_CONTACT_EMAIL}.`);
    }
  };

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

  const confirmDelete = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and personal data. This cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await accountApi.deleteAccount();
              Alert.alert('Account Deleted', 'Your account and data have been deleted.');
              await logout().catch(() => {});
              setTimeout(() => router.replace('/'), 100);
            } catch (e: any) {
              Alert.alert('Could not delete account', e.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

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
            <TouchableOpacity
              testID="become-vendor-btn"
              style={styles.becomeVendorCard}
              onPress={() => setVendorModal(true)}
              activeOpacity={0.85}
            >
              <Store size={24} color={COLORS.primary} />
              <View style={styles.becomeVendorContent}>
                <Text style={styles.becomeVendorTitle}>Become a Vendor</Text>
                <Text style={styles.becomeVendorSub}>Contact us to list your surplus food</Text>
              </View>
              <ChevronRight size={20} color={COLORS.primary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            testID="help-support-btn"
            style={styles.actionCard}
            onPress={() => router.push('/support')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EFF6FF' }]}>
              <LifeBuoy size={20} color="#2563EB" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Help & Support</Text>
              <Text style={styles.actionSubtitle}>Report an issue with your order</Text>
            </View>
            <ChevronRight size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {user.role === 'user' && (
            <TouchableOpacity
              testID="view-app-intro-btn"
              style={styles.actionCard}
              onPress={() => router.push('/onboarding?replay=1')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIcon, { backgroundColor: COLORS.primary + '15' }]}>
                <Sparkles size={20} color={COLORS.primary} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>View app intro</Text>
                <Text style={styles.actionSubtitle}>Revisit the welcome walkthrough</Text>
              </View>
              <ChevronRight size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
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

        <TouchableOpacity
          testID="delete-account-btn"
          style={styles.deleteBtn}
          onPress={confirmDelete}
          activeOpacity={0.8}
        >
          <Trash2 size={18} color={COLORS.textMuted} />
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Become a Vendor - collect details then open email */}
      <Modal visible={vendorModal} transparent animationType="slide" onRequestClose={() => setVendorModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Become a Vendor</Text>
              <TouchableOpacity testID="vendor-modal-close" onPress={() => setVendorModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Share a few details and we'll open your email to send them to our team.</Text>

            <Text style={styles.fieldLabel}>Owner Name</Text>
            <TextInput testID="vendor-owner-input" style={styles.input} value={vOwner} onChangeText={setVOwner}
              placeholder="e.g. Ravi Kumar" placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.fieldLabel}>Restaurant Name</Text>
            <TextInput testID="vendor-restaurant-input" style={styles.input} value={vRestaurant} onChangeText={setVRestaurant}
              placeholder="e.g. Namma Tiffins" placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.fieldLabel}>City</Text>
            <TextInput testID="vendor-city-input" style={styles.input} value={vCity} onChangeText={setVCity}
              placeholder="e.g. Bengaluru" placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.fieldLabel}>Mobile Number</Text>
            <TextInput testID="vendor-mobile-input" style={styles.input} value={vMobile} onChangeText={setVMobile}
              placeholder="e.g. 9876543210" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" />

            <TouchableOpacity testID="vendor-send-email-btn" style={styles.modalSubmit} onPress={sendVendorEmail} activeOpacity={0.85}>
              <Mail size={18} color="#fff" />
              <Text style={styles.modalSubmitText}>Send Email</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  modalSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 4, marginBottom: SPACING.md },
  fieldLabel: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginBottom: 6, marginTop: SPACING.sm },
  input: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 46,
    fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary,
  },
  modalSubmit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 15, marginTop: SPACING.lg,
  },
  modalSubmitText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
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
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, marginTop: SPACING.sm,
  },
  deleteText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted, textDecorationLine: 'underline' },
});

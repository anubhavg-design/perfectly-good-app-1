import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Mail, Key } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { authApi } from '../src/api/client';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      if (res?.reset_token) {
        setToken(res.reset_token);
      }
      setStep('reset');
      Alert.alert('Check your email', 'A reset token has been sent.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!token.trim() || !newPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token.trim(), newPassword);
      Alert.alert('Success', 'Password has been reset. Please log in.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <TouchableOpacity testID="forgot-back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.title}>
            {step === 'email' ? 'Forgot Password' : 'Reset Password'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'email'
              ? 'Enter your email and we\'ll send you a reset token.'
              : 'Enter the reset token and your new password.'
            }
          </Text>

          <View style={styles.formCard}>
            {step === 'email' ? (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email</Text>
                  <View style={styles.inputWrap}>
                    <Mail size={18} color={COLORS.textMuted} />
                    <TextInput
                      testID="forgot-email-input"
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
                <TouchableOpacity
                  testID="send-reset-btn"
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleForgotPassword}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Send Reset Token</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Reset Token</Text>
                  <View style={styles.inputWrap}>
                    <Key size={18} color={COLORS.textMuted} />
                    <TextInput
                      testID="reset-token-input"
                      style={styles.input}
                      value={token}
                      onChangeText={setToken}
                      placeholder="Paste token here"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>New Password</Text>
                  <TextInput
                    testID="new-password-input"
                    style={[styles.input, styles.inputFull]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry
                  />
                </View>
                <TouchableOpacity
                  testID="reset-password-btn"
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleResetPassword}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Reset Password</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity onPress={() => router.replace('/')}>
            <Text style={styles.backToLogin}>Back to Login</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingTop: SPACING.md },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginBottom: SPACING.lg },
  title: { fontSize: 28, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  subtitle: { fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginBottom: SPACING.lg, lineHeight: 22 },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOWS.medium },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md,
  },
  input: {
    flex: 1, paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary,
  },
  inputFull: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary,
  },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  backToLogin: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.primary, textAlign: 'center', marginTop: SPACING.lg },
});

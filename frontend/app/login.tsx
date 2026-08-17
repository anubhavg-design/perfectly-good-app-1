import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../src/context/AuthContext';
import { authApi } from '../src/api/client';
import { hasSeenOnboarding } from '../src/utils/onboarding';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { Eye, EyeOff, X } from 'lucide-react-native';

export default function LoginScreen() {
  const { login, register, appleLogin } = useAuth();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);

  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  const routeForUser = async (u: any, nextPath?: string) => {
    let role = (u as any)?.role;
    // Robustness: if the login payload didn't include a role, fetch the
    // authoritative user before deciding, so staff/vendors are never
    // mistakenly dropped onto the customer home screen.
    if (!role) {
      try { const me = await authApi.me(); role = (me as any)?.role; } catch {}
    }
    const staff = ['admin', 'semi_admin', 'operations', 'customer_success', 'finance'];
    // Staff and vendors ALWAYS go to their panels — never a customer `next`.
    if (role && staff.includes(role)) { router.replace('/ops'); return; }
    if (role === 'vendor' || role === 'vendor_staff') { router.replace('/(tabs)/dashboard'); return; }
    // Customers: resume the action they attempted as a guest, else home/onboarding.
    if (nextPath) { router.replace(nextPath); return; }
    const seen = await hasSeenOnboarding(u?.user_id);
    router.replace(seen ? '/(tabs)/home' : '/onboarding');
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields'); return; }
    if (!isLogin && !name.trim()) { setError('Please enter your name'); return; }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) { setError('Please enter a valid email address'); return; }
    if (!isLogin && password.trim().length < 6) { setError('Password must be at least 6 characters'); return; }
    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      if (isLogin) {
        const u = await login(cleanEmail, cleanPassword);
        // Route by role; customers resume `next` inside routeForUser.
        await routeForUser(u, next as string | undefined);
      } else {
        await register(name.trim(), cleanEmail, phone.trim(), cleanPassword);
        if (next) { router.replace(next as string); return; }
        router.replace('/onboarding');
      }
    } catch (err: any) {
      if (err.message && err.message.includes('fetch')) {
        setError('Unable to connect to server. Please check your internet connection.');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleApple = async () => {
    setError('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setError('Apple Sign In failed. Please try again.');
        return;
      }
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ');
      setSubmitting(true);
      const u = await appleLogin(credential.identityToken, fullName || undefined, credential.email || undefined);
      await routeForUser(u, next as string | undefined);
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // user cancelled
      setError(e?.message || 'Apple Sign In failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.closeRow}>
        <TouchableOpacity testID="login-close" onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <X size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Image source={require('../assets/images/splash-icon.png')} style={styles.logoImage} resizeMode="contain" accessibilityLabel="Perfectly Good" />
            <Text style={styles.tagline}>Better Choices.{'\n'}Perfectly Good.</Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.tabRow}>
              <TouchableOpacity testID="login-tab" style={[styles.tab, isLogin && styles.tabActive]} onPress={() => { setIsLogin(true); setError(''); }}>
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Log In</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="register-tab" style={[styles.tab, !isLogin && styles.tabActive]} onPress={() => { setIsLogin(false); setError(''); }}>
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            {error ? (<View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>) : null}

            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput testID="name-input" style={styles.input} value={name} onChangeText={setName} placeholder="John Doe" placeholderTextColor={COLORS.textMuted} autoCapitalize="words" />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput testID="email-input" style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={COLORS.textMuted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" autoComplete="off" importantForAutofill="no" />
            </View>

            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput testID="phone-input" style={styles.input} value={phone} onChangeText={setPhone} placeholder="9876543210" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" autoCorrect={false} />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput testID="password-input" style={[styles.input, styles.passwordInput]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={COLORS.textMuted} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" autoComplete="off" importantForAutofill="no" keyboardType={showPassword ? 'visible-password' : 'default'} />
                <TouchableOpacity testID="toggle-password" style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={20} color={COLORS.textSecondary} /> : <Eye size={20} color={COLORS.textSecondary} />}
                </TouchableOpacity>
              </View>
            </View>

            {isLogin && (
              <TouchableOpacity testID="forgot-password-link" onPress={() => router.push('/forgot-password')}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity testID="auth-submit-btn" style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{isLogin ? 'Log In' : 'Create Account'}</Text>}
            </TouchableOpacity>

            {appleAvailable && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.divider} />
                </View>
                <AppleAuthentication.AppleAuthenticationButton
                  testID="apple-signin-btn"
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={RADIUS.md}
                  style={styles.appleBtn}
                  onPress={handleApple}
                />
              </>
            )}
          </View>

          <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
            <Text style={styles.footerText}>By continuing, you agree to our Terms of Service & Privacy Policy</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  scrollContent: { flexGrow: 1, padding: SPACING.lg, justifyContent: 'center' },
  header: { marginBottom: SPACING.xl, alignItems: 'center' },
  logoImage: { width: 240, height: 96, marginBottom: SPACING.sm },
  tagline: { fontSize: 16, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24 },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOWS.medium },
  tabRow: { flexDirection: 'row', marginBottom: SPACING.lg, backgroundColor: COLORS.borderLight, borderRadius: RADIUS.sm, padding: 2 },
  tab: { flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.sm - 2, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.surface, ...SHADOWS.small },
  tabText: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontFamily: 'DMSans_700Bold' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.md },
  errorText: { color: COLORS.error, fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center' },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary, marginBottom: SPACING.xs + 2 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: Platform.OS === 'ios' ? 14 : 12, fontSize: 16, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  forgotText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.primary, textAlign: 'right', marginBottom: SPACING.md },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: SPACING.sm, fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  appleBtn: { height: 48, width: '100%' },
  footerText: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.lg },
});

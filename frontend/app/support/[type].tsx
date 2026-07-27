import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Image, Platform, Linking, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, CheckCircle2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { getIssueType } from '../../src/constants/support';
import { supportApi } from '../../src/api/client';

export default function SupportDetail() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: string }>();
  const issue = getIssueType(type);

  const [ctx, setCtx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [deviceModel, setDeviceModel] = useState(`${Platform.OS} ${Platform.Version}`);
  const [appVersion, setAppVersion] = useState(Constants.expoConfig?.version || '1.0.0');
  const [whatHappened, setWhatHappened] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supportApi.context().then(setCtx).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.getCameraPermissionsAsync();
      let status = perm.status;
      if (status !== 'granted') {
        if (!perm.canAskAgain) {
          Alert.alert('Camera access needed', 'Please enable camera access in Settings to attach a photo.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        const req = await ImagePicker.requestCameraPermissionsAsync();
        status = req.status;
        if (status !== 'granted') {
          if (!req.canAskAgain) {
            Alert.alert('Camera access needed', 'Please enable camera access in Settings to attach a photo.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
          }
          return;
        }
      }
      const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, allowsEditing: false });
      if (!res.canceled && res.assets?.[0]?.base64) {
        setPhoto(`data:${res.assets[0].mimeType || 'image/jpeg'};base64,${res.assets[0].base64}`);
      }
    } catch (e: any) {
      Alert.alert('Camera error', e.message || 'Could not open the camera on this device.');
    }
  };

  const submit = async () => {
    if (issue?.requiresPhoto && !photo) {
      Alert.alert('Photo required', 'Please take a photo of the item you received.');
      return;
    }
    setSubmitting(true);
    try {
      await supportApi.submit({
        issue_type: type!,
        message,
        photo_base64: issue?.requiresPhoto ? photo : null,
        device_model: issue?.isBug ? deviceModel : undefined,
        app_version: issue?.isBug ? appVersion : undefined,
        what_happened: issue?.isBug ? whatHappened : undefined,
      });
      Alert.alert('Request Submitted', 'Thanks! Our team has received your request and will get back to you shortly.', [
        { text: 'Done', onPress: () => router.replace('/(tabs)/profile') },
      ]);
    } catch (e: any) {
      Alert.alert('Could not submit', e.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!issue) {
    return (
      <SafeAreaView style={styles.container}><Text style={styles.subtitle}>Unknown issue type.</Text></SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="support-detail-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{issue.label}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
          ) : (
            <>
              <Text style={styles.sectionLabel}>Your Details</Text>
              <View style={styles.card}>
                <Field label="Customer Name" value={ctx?.customer_name} />
                <Field label="Phone Number" value={ctx?.phone} />
                {ctx?.has_order ? (
                  <>
                    <Field label="Order ID" value={ctx?.order_id} />
                    <Field label="Restaurant Name" value={ctx?.restaurant_name} />
                    <Field label="Order Amount" value={ctx?.order_amount != null ? `₹${ctx.order_amount}` : '—'} />
                    <Field label="Pickup Date & Time" value={ctx?.pickup_datetime} last />
                  </>
                ) : (
                  <Text style={styles.noOrder}>No order found for today. You can still send us your request.</Text>
                )}
              </View>

              {issue.requiresPhoto && (
                <>
                  <Text style={styles.sectionLabel}>Photo (Required)</Text>
                  {photo ? (
                    <View>
                      <Image source={{ uri: photo }} style={styles.photoPreview} />
                      <TouchableOpacity testID="retake-photo" style={styles.retakeBtn} onPress={takePhoto}>
                        <Camera size={16} color={COLORS.primary} />
                        <Text style={styles.retakeText}>Retake Photo</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity testID="take-photo-btn" style={styles.cameraBtn} onPress={takePhoto} activeOpacity={0.85}>
                      <Camera size={20} color="#fff" />
                      <Text style={styles.cameraBtnText}>Take a Photo (Required)</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {issue.isBug && (
                <>
                  <Text style={styles.sectionLabel}>Bug Details (optional)</Text>
                  <View style={styles.card}>
                    <InputField label="Device Model" value={deviceModel} onChangeText={setDeviceModel} placeholder="e.g. iPhone 14" />
                    <InputField label="App Version" value={appVersion} onChangeText={setAppVersion} placeholder="e.g. 1.0.2" />
                    <InputField label="What happened?" value={whatHappened} onChangeText={setWhatHappened} placeholder="Describe the bug" multiline last />
                  </View>
                </>
              )}

              <Text style={styles.sectionLabel}>Tell us more (optional)</Text>
              <TextInput
                testID="support-message"
                style={styles.messageBox}
                value={message}
                onChangeText={setMessage}
                placeholder="Add any details that could help us resolve this faster…"
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
              />
            </>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity testID="submit-support" style={[styles.submitBtn, submitting && { opacity: 0.7 }]} onPress={submit} disabled={submitting || loading} activeOpacity={0.85}>
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <CheckCircle2 size={20} color="#fff" />
                <Text style={styles.submitBtnText}>Submit Request</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, last }: { label: string; value?: any; last?: boolean }) {
  return (
    <View style={[styles.fieldRow, !last && styles.fieldDivider]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '—'}</Text>
    </View>
  );
}

function InputField({ label, value, onChangeText, placeholder, multiline, last }: any) {
  return (
    <View style={[styles.fieldRow, !last && styles.fieldDivider, { flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.inlineInput, multiline && { minHeight: 60 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.surface,
  },
  backBtn: { padding: 2 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, padding: SPACING.md },
  sectionLabel: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm, marginTop: SPACING.md },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, ...SHADOWS.small },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm + 2 },
  fieldDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  fieldLabel: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  fieldValue: { flex: 1, textAlign: 'right', fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary, marginLeft: SPACING.md },
  inlineInput: { fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, paddingVertical: 4 },
  noOrder: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, paddingVertical: SPACING.md },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 15 },
  cameraBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  photoPreview: { width: '100%', height: 200, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  retakeText: { color: COLORS.primary, fontSize: 14, fontFamily: 'DMSans_500Medium' },
  messageBox: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderLight,
    padding: SPACING.md, minHeight: 100, fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary,
  },
  bottomBar: { padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16 },
  submitBtnText: { color: '#fff', fontSize: 17, fontFamily: 'Outfit_700Bold' },
});

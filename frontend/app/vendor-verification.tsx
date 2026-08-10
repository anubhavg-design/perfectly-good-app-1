import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, Upload, FileText, Ban, LogOut,
} from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { vendorApi } from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';

async function pickDocumentBase64(): Promise<{ name: string; mime: string; data: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets || !res.assets[0]) return null;
  const asset = res.assets[0];
  const mime = asset.mimeType || (asset.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  if (asset.size && asset.size > 5 * 1024 * 1024) {
    throw new Error('File is too large. Please upload a file under 5 MB.');
  }
  let data = '';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    data = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  return { name: asset.name || 'document', mime, data };
}

export default function VendorVerification() {
  const router = useRouter();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('draft');
  const [rejectionReason, setRejectionReason] = useState('');
  const [agreement, setAgreement] = useState<any>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const boxH = React.useRef(0);

  // form
  const [f, setF] = useState<any>({
    business_name: '', authorised_representative: '', business_email: '',
    gst_status: '', gst_number: '', gst_certificate: null,
    fssai_number: '', fssai_certificate: null,
    bank_account_holder: '', bank_account_number: '', bank_ifsc: '', bank_name: '',
  });
  const [confirmAcct, setConfirmAcct] = useState('');
  const [sigName, setSigName] = useState('');
  const [sigDesignation, setSigDesignation] = useState('');
  const [agree, setAgree] = useState(false);
  const [decl, setDecl] = useState({ authorised: false, accurate: false, agreement: false, food_safety: false });

  const autosaveDirty = React.useRef(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const set = (k: string, v: any) => { autosaveDirty.current = true; setF((p: any) => ({ ...p, [k]: v })); };

  const autosavePayload = () => ({
    business_name: f.business_name, authorised_representative: f.authorised_representative,
    business_email: f.business_email, gst_status: f.gst_status, gst_number: f.gst_number,
    fssai_number: f.fssai_number, bank_account_holder: f.bank_account_holder,
    bank_account_number: f.bank_account_number, bank_ifsc: f.bank_ifsc, bank_name: f.bank_name,
  });

  const load = useCallback(async () => {
    try {
      const res = await vendorApi.getVerification();
      setStatus(res.status);
      setRejectionReason(res.rejection_reason || '');
      setAgreement(res.agreement);
      const v = res.verification || {};
      setF({
        business_name: v.business_name || '', authorised_representative: v.authorised_representative || '',
        business_email: v.business_email || '', gst_status: v.gst_status || '',
        gst_number: v.gst_number || '', gst_certificate: v.gst_certificate || null,
        fssai_number: v.fssai_number || '', fssai_certificate: v.fssai_certificate || null,
        bank_account_holder: v.bank_account_holder || '', bank_account_number: v.bank_account_number || '',
        bank_ifsc: v.bank_ifsc || '', bank_name: v.bank_name || '',
      });
      setConfirmAcct(v.bank_account_number || '');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not load verification.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Progress Saver: debounced auto-save of text fields whenever the vendor edits
  // (only while the form is editable). Certificates are saved immediately on upload.
  const textKey = JSON.stringify(autosavePayload());
  useEffect(() => {
    if (!(status === 'draft' || status === 'rejected')) return;
    if (!autosaveDirty.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try { await vendorApi.saveVerification(autosavePayload()); setSaveState('saved'); }
      catch { setSaveState('idle'); }
    }, 1200);
    return () => clearTimeout(t);
  }, [textKey, status]);

  const uploadDoc = async (key: 'gst_certificate' | 'fssai_certificate') => {
    try {
      const doc = await pickDocumentBase64();
      if (doc) {
        autosaveDirty.current = true;
        setF((p: any) => ({ ...p, [key]: doc }));
        setSaveState('saving');
        try { await vendorApi.saveVerification({ ...autosavePayload(), [key]: doc }); setSaveState('saved'); }
        catch { setSaveState('idle'); }
      }
    } catch (e: any) { Alert.alert('Upload failed', e.message || 'Please try again.'); }
  };

  const buildPayload = () => ({
    business_name: f.business_name, authorised_representative: f.authorised_representative,
    business_email: f.business_email, gst_status: f.gst_status, gst_number: f.gst_number,
    gst_certificate: f.gst_certificate?.data ? f.gst_certificate : undefined,
    fssai_number: f.fssai_number,
    fssai_certificate: f.fssai_certificate?.data ? f.fssai_certificate : undefined,
    bank_account_holder: f.bank_account_holder, bank_account_number: f.bank_account_number,
    bank_ifsc: f.bank_ifsc, bank_name: f.bank_name,
  });

  const saveDraft = async () => {
    setSaving(true);
    try { await vendorApi.saveVerification(buildPayload()); Alert.alert('Saved', 'Your progress has been saved.'); }
    catch (e: any) { Alert.alert('Could not save', e.message); } finally { setSaving(false); }
  };

  const submit = async () => {
    if (f.bank_account_number !== confirmAcct) {
      Alert.alert('Account number mismatch', 'The account number and confirmation do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await vendorApi.submitVerification({
        ...buildPayload(),
        agreement_version: agreement?.version || '',
        signature_full_name: sigName, signature_designation: sigDesignation,
        agreed_agreement: agree,
        decl_authorised: decl.authorised, decl_accurate: decl.accurate,
        decl_agreement: decl.agreement, decl_food_safety: decl.food_safety,
      });
      Alert.alert('Submitted', res.message, [{ text: 'OK', onPress: () => load() }]);
    } catch (e: any) {
      Alert.alert('Cannot submit yet', e.message);
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const gated = status === 'draft' || status === 'rejected';

  const Header = (
    <View style={styles.header}>
      {gated ? (
        <TouchableOpacity testID="verif-logout" onPress={() => logout()} style={styles.headerBack}>
          <LogOut size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity testID="verif-back" onPress={() => router.replace('/(tabs)/dashboard')} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
      )}
      <Text style={styles.headerTitle}>Business Verification</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // Locked / status states (compliance already submitted or account decided)
  if (status === 'pending_verification' || status === 'active' || status === 'suspended') {
    const cfg = status === 'active'
      ? { icon: CheckCircle2, color: COLORS.primary, title: 'Your account is active', msg: 'Your verification was approved. You can now go live and receive orders.' }
      : status === 'suspended'
      ? { icon: Ban, color: COLORS.error, title: 'Account suspended', msg: 'Your account has been suspended. Please contact the Perfectly Good team for assistance.' }
      : { icon: Clock, color: '#B7791F', title: 'Awaiting admin approval', msg: 'Your verification has been submitted and is awaiting admin approval. We will notify you once it is reviewed.' };
    const Icon = cfg.icon;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <View style={styles.statusWrap}>
          <View style={[styles.statusIcon, { backgroundColor: cfg.color + '18' }]}><Icon size={40} color={cfg.color} /></View>
          <Text style={styles.statusTitle}>{cfg.title}</Text>
          <Text style={styles.statusMsg}>{cfg.msg}</Text>
          <TouchableOpacity testID="go-dashboard" style={styles.dashBtn} onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={styles.dashBtnText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {status === 'rejected' && !!rejectionReason && (
          <View style={styles.rejectBanner}>
            <XCircle size={18} color={COLORS.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectTitle}>Verification rejected</Text>
              <Text style={styles.rejectMsg}>{rejectionReason}</Text>
              <Text style={styles.rejectHint}>Please update the details below and resubmit.</Text>
            </View>
          </View>
        )}

        <Text style={styles.intro}>Complete the details below to submit your restaurant for approval. Your progress is saved automatically.</Text>

        {saveState !== 'idle' && (
          <View style={styles.saveRow} testID="autosave-indicator">
            {saveState === 'saving' ? <ActivityIndicator size="small" color={COLORS.textMuted} /> : <CheckCircle2 size={14} color={COLORS.primary} />}
            <Text style={styles.saveText}>{saveState === 'saving' ? 'Saving…' : 'Progress saved'}</Text>
          </View>
        )}

        {/* Business Details */}
        <Section title="Business Details">
          <Input label="Restaurant / Business Name" value={f.business_name} onChangeText={(v: string) => set('business_name', v)} />
          <Input label="Authorised Representative" value={f.authorised_representative} onChangeText={(v: string) => set('authorised_representative', v)} />
          <Input label="Official Business Email" value={f.business_email} onChangeText={(v: string) => set('business_email', v)} keyboardType="email-address" autoCapitalize="none" />
        </Section>

        {/* GST */}
        <Section title="GST">
          <Text style={styles.fieldLabel}>GST Status</Text>
          <View style={styles.chipRow}>
            {[['registered', 'Registered'], ['not_registered', 'Not Registered']].map(([val, lbl]) => (
              <TouchableOpacity key={val} style={[styles.chip, f.gst_status === val && styles.chipActive]} onPress={() => set('gst_status', val)}>
                <Text style={[styles.chipText, f.gst_status === val && styles.chipTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {f.gst_status === 'registered' && (
            <>
              <Input label="GST Number" value={f.gst_number} onChangeText={(v: string) => set('gst_number', v.toUpperCase())} autoCapitalize="characters" />
              <UploadRow label="GST Certificate" doc={f.gst_certificate} onPress={() => uploadDoc('gst_certificate')} />
            </>
          )}
        </Section>

        {/* FSSAI */}
        <Section title="FSSAI (Mandatory)">
          <Input label="FSSAI Licence Number" value={f.fssai_number} onChangeText={(v: string) => set('fssai_number', v)} keyboardType="number-pad" />
          <UploadRow label="FSSAI Certificate" doc={f.fssai_certificate} onPress={() => uploadDoc('fssai_certificate')} />
        </Section>

        {/* Bank */}
        <Section title="Bank Details (Mandatory)">
          <Input label="Account Holder Name" value={f.bank_account_holder} onChangeText={(v: string) => set('bank_account_holder', v)} />
          <Input label="Account Number" value={f.bank_account_number} onChangeText={(v: string) => set('bank_account_number', v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" secureText />
          <Input label="Confirm Account Number" value={confirmAcct} onChangeText={(v: string) => setConfirmAcct(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
          {!!confirmAcct && confirmAcct !== f.bank_account_number && <Text style={styles.errText}>Account numbers do not match</Text>}
          <Input label="IFSC Code" value={f.bank_ifsc} onChangeText={(v: string) => set('bank_ifsc', v.toUpperCase())} autoCapitalize="characters" />
          <Input label="Bank Name" value={f.bank_name} onChangeText={(v: string) => set('bank_name', v)} />
        </Section>

        {/* Agreement */}
        <Section title="Vendor Agreement">
          <Text style={styles.fieldLabel}>Please read the full agreement (scroll to the end)</Text>
          <View style={styles.agreementBox}>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              onLayout={(e) => { boxH.current = e.nativeEvent.layout.height; }}
              onContentSizeChange={(_w, h) => { if (h <= boxH.current + 8) setScrolledEnd(true); }}
              onScroll={(e) => {
                const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 24) setScrolledEnd(true);
              }}
              scrollEventThrottle={64}
            >
              <Text style={styles.agreementText}>{agreement?.content || 'Loading agreement…'}</Text>
            </ScrollView>
          </View>
          <Text style={styles.versionText}>Version {agreement?.version || '—'}</Text>
          {!scrolledEnd && <Text style={styles.scrollHint}>Scroll to the end of the agreement to continue.</Text>}

          <CheckRow
            testID="agree-checkbox"
            checked={agree}
            disabled={!scrolledEnd}
            onToggle={() => setAgree((x) => !x)}
            label="I have read and agree to the Vendor Agreement."
          />

          <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Electronic Signature</Text>
          <Input label="Full Legal Name" value={sigName} onChangeText={setSigName} />
          <Input label="Designation" value={sigDesignation} onChangeText={setSigDesignation} />
        </Section>

        {/* Legal Declaration */}
        <Section title="Legal Declaration">
          <CheckRow checked={decl.authorised} onToggle={() => setDecl((d) => ({ ...d, authorised: !d.authorised }))} label="I am authorised to represent this business." />
          <CheckRow checked={decl.accurate} onToggle={() => setDecl((d) => ({ ...d, accurate: !d.accurate }))} label="All submitted information is accurate." />
          <CheckRow checked={decl.agreement} onToggle={() => setDecl((d) => ({ ...d, agreement: !d.agreement }))} label="I agree to the Vendor Agreement." />
          <CheckRow checked={decl.food_safety} onToggle={() => setDecl((d) => ({ ...d, food_safety: !d.food_safety }))} label="I agree to comply with all applicable food safety laws." />
        </Section>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.saveBtn} onPress={saveDraft} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.saveBtnText}>Save Draft</Text>}
          </TouchableOpacity>
          <TouchableOpacity testID="submit-verification" style={styles.submitBtn} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit for Approval</Text>}
          </TouchableOpacity>
        </View>
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Input({ label, secureText, ...rest }: any) {
  return (
    <View style={{ marginBottom: SPACING.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} secureTextEntry={secureText} {...rest} />
    </View>
  );
}
function UploadRow({ label, doc, onPress }: any) {
  return (
    <View style={{ marginBottom: SPACING.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.uploadBtn} onPress={onPress}>
        {doc?.data ? <FileText size={18} color={COLORS.primary} /> : <Upload size={18} color={COLORS.textSecondary} />}
        <Text style={[styles.uploadText, doc?.data && { color: COLORS.primary }]} numberOfLines={1}>
          {doc?.data ? (doc.name || 'Uploaded') : 'Upload PDF or image'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
function CheckRow({ checked, disabled, onToggle, label, testID }: any) {
  return (
    <TouchableOpacity testID={testID} style={[styles.checkRow, disabled && { opacity: 0.5 }]} onPress={disabled ? undefined : onToggle} activeOpacity={0.7}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked ? <CheckCircle2 size={16} color="#fff" /> : null}</View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  content: { padding: SPACING.md },
  intro: { fontSize: 13.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 20 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  saveText: { fontSize: 12.5, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.small },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  fieldLabel: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary, marginBottom: 6 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary },
  errText: { fontSize: 12, color: COLORS.error, marginBottom: SPACING.sm, marginTop: -2 },
  chipRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  chip: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.background },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  chipTextActive: { color: '#fff', fontFamily: 'DMSans_700Bold' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 14 },
  uploadText: { flex: 1, fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  agreementBox: { height: 260, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.sm, backgroundColor: COLORS.background },
  agreementText: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, lineHeight: 19 },
  versionText: { fontSize: 12, color: COLORS.textMuted, marginTop: 6, textAlign: 'right' },
  scrollHint: { fontSize: 12, color: '#B7791F', marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: SPACING.sm },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { flex: 1, fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  saveBtn: { flex: 1, paddingVertical: 15, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center' },
  saveBtnText: { color: COLORS.primary, fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  submitBtn: { flex: 1.4, paddingVertical: 15, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  rejectBanner: { flexDirection: 'row', gap: SPACING.sm, backgroundColor: '#FEF2F2', borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.error + '33' },
  rejectTitle: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.error },
  rejectMsg: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, marginTop: 2 },
  rejectHint: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 4 },
  statusWrap: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: 60 },
  statusIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  statusTitle: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, textAlign: 'center' },
  statusMsg: { fontSize: 14.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  dashBtn: { marginTop: SPACING.xl, backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: SPACING.xl, borderRadius: RADIUS.md },
  dashBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
});

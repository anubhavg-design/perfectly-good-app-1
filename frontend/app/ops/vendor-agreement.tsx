import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, fmtDateTime } from '../../src/ops/theme';
import { Card, Btn, Spinner, PageHeader } from '../../src/ops/ui';
import { useAuth } from '../../src/context/AuthContext';

export default function VendorAgreementEditor() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [content, setContent] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    opsApi.getAgreement().then((a) => {
      setContent(a.content || ''); setPdfUrl(a.pdf_url || ''); setMeta(a);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const a = await opsApi.updateAgreement({ content, pdf_url: pdfUrl, bump_version: true });
      setMeta(a); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  if (loading) return <Spinner label="Loading agreement…" />;

  return (
    <View>
      <PageHeader title="Vendor Agreement" subtitle={`Version ${meta?.version || '—'}${meta?.updated_at ? ` · updated ${fmtDateTime(meta.updated_at)}` : ''}`}
        right={isAdmin ? <Btn title={saved ? 'Saved ✓' : 'Save & Publish'} onPress={save} loading={saving} /> : undefined} />

      {!isAdmin && <Card style={{ marginBottom: SP.lg }}><Text style={{ color: C.textMute }}>Only an admin can edit the vendor agreement. Shown below is the current version.</Text></Card>}

      <Card style={{ marginBottom: SP.lg }}>
        <Text style={styles.label}>Agreement Content</Text>
        <Text style={styles.hint}>Vendors must scroll through this text and accept it before submitting for approval. Saving publishes a new version.</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          editable={isAdmin}
          multiline
          placeholder="Paste the full vendor agreement text here…"
          placeholderTextColor={C.textMute}
          style={styles.textArea}
        />
      </Card>

      <Card>
        <Text style={styles.label}>Optional PDF Download Link</Text>
        <Text style={styles.hint}>A public URL to the PDF version, offered to vendors as an optional download.</Text>
        <TextInput
          value={pdfUrl}
          onChangeText={setPdfUrl}
          editable={isAdmin}
          placeholder="https://…/vendor-agreement.pdf"
          placeholderTextColor={C.textMute}
          autoCapitalize="none"
          style={styles.input}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 4 },
  hint: { fontSize: 12.5, color: C.textMute, marginBottom: SP.md },
  textArea: { minHeight: 420, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: SP.md, color: C.text, fontSize: 13, lineHeight: 20, textAlignVertical: 'top', outlineStyle: 'none' as any },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: SP.md, paddingVertical: 10, color: C.text, fontSize: 14, outlineStyle: 'none' as any },
});

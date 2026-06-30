import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Sparkles, FileSpreadsheet, ImagePlus, Trash2, FileText } from 'lucide-react-native';
import { opsApi } from '../api/opsApi';
import { C, SP, R } from './theme';
import { Sheet, Btn, TextField, Toggle, Spinner, EmptyState } from './ui';

export function ImportMenu({ visible, onClose, vendorId, onDone }: any) {
  const [mode, setMode] = useState<'ai' | 'bulk'>('ai');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setRows(null); setErr(''); setLoading(false); };
  const close = () => { reset(); onClose(); };

  const run = async (fn: () => Promise<any>) => {
    setErr(''); setLoading(true);
    try {
      const res = await fn();
      const items = (res.items || []).map((r: any) => ({ image_url: '', ...r }));
      if (!items.length) setErr('No items could be detected. Try a clearer file.');
      setRows(items);
    } catch (e: any) { setErr(e.message || 'Failed to process file'); }
    finally { setLoading(false); }
  };

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled) run(() => opsApi.extractMenu(r.assets[0].uri, r.assets[0].fileName || 'menu.jpg'));
  };
  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!r.canceled) run(() => opsApi.extractMenu(r.assets[0].uri, r.assets[0].name));
  };
  const pickSheet = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], copyToCacheDirectory: true });
    if (!r.canceled) run(() => opsApi.parseMenuFile(r.assets[0].uri, r.assets[0].name));
  };

  const updateRow = (i: number, k: string, v: any) => setRows((p) => p!.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const removeRow = (i: number) => setRows((p) => p!.filter((_, idx) => idx !== i));
  const pickRowImage = async (i: number) => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
    if (!r.canceled && r.assets?.[0]?.base64) updateRow(i, 'image_url', `data:${r.assets[0].mimeType || 'image/jpeg'};base64,${r.assets[0].base64}`);
  };

  const save = async () => {
    const valid = (rows || []).filter((r) => r.name?.trim() && Number(r.original_price) > 0);
    if (!valid.length) { setErr('Add at least one item with a name and price'); return; }
    setSaving(true);
    try { const res = await opsApi.bulkAddMenu(vendorId, valid); reset(); onDone(res.created); }
    catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet visible={visible} onClose={close} title="Import Menu" wide
      footer={rows ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: C.textSec }}>{rows.length} item(s) ready</Text>
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            <Btn title="Start Over" variant="secondary" small onPress={reset} />
            <Btn title={`Save ${rows.length} Items`} small onPress={save} loading={saving} />
          </View>
        </View>
      ) : undefined}>

      {!rows && (
        <>
          <View style={styles.tabs}>
            <Pressable onPress={() => setMode('ai')} style={[styles.tab, mode === 'ai' && styles.tabActive]}>
              <Sparkles size={16} color={mode === 'ai' ? C.primary : C.textSec} />
              <Text style={[styles.tabText, mode === 'ai' && { color: C.primary }]}>AI Import (Image / PDF)</Text>
            </Pressable>
            <Pressable onPress={() => setMode('bulk')} style={[styles.tab, mode === 'bulk' && styles.tabActive]}>
              <FileSpreadsheet size={16} color={mode === 'bulk' ? C.primary : C.textSec} />
              <Text style={[styles.tabText, mode === 'bulk' && { color: C.primary }]}>Bulk Import (CSV / Excel)</Text>
            </Pressable>
          </View>

          {loading ? <Spinner label={mode === 'ai' ? 'Reading menu with AI…' : 'Parsing file…'} /> : (
            <View style={{ paddingVertical: SP.md }}>
              {mode === 'ai' ? (
                <>
                  <Text style={styles.help}>Upload a photo or PDF of the menu. AI extracts item names, descriptions and prices into an editable table.</Text>
                  <View style={{ flexDirection: 'row', gap: SP.md }}>
                    <Btn title="Upload Image" icon={ImagePlus} variant="secondary" onPress={pickImage} />
                    <Btn title="Upload PDF" icon={FileText} variant="secondary" onPress={pickPdf} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.help}>Upload a CSV or Excel file. Columns: Item Name, Description, Original Price, Discounted Price, Serving Size, Category, Veg, Contains Egg, Available Today.</Text>
                  <Btn title="Upload CSV / Excel" icon={FileSpreadsheet} variant="secondary" onPress={pickSheet} />
                </>
              )}
              {err ? <Text style={{ color: C.danger, marginTop: SP.md }}>{err}</Text> : null}
            </View>
          )}
        </>
      )}

      {rows && (
        <View>
          <Text style={styles.help}>Review the extracted items, set discounted prices, optionally add images, then save.</Text>
          {err ? <Text style={{ color: C.danger, marginBottom: SP.sm }}>{err}</Text> : null}
          {rows.length === 0 ? <EmptyState title="Nothing to review" /> : rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <Pressable onPress={() => pickRowImage(i)}>
                {r.image_url ? <Image source={{ uri: r.image_url }} style={styles.thumb} /> :
                  <View style={[styles.thumb, styles.thumbEmpty]}><ImagePlus size={18} color={C.textMute} /></View>}
              </Pressable>
              <View style={{ flex: 1, gap: 6, minWidth: 200 }}>
                <TextField value={r.name} onChangeText={(v: string) => updateRow(i, 'name', v)} placeholder="Item name" />
                <TextField value={r.description} onChangeText={(v: string) => updateRow(i, 'description', v)} placeholder="Description" />
                <View style={{ flexDirection: 'row', gap: SP.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                  <View style={{ width: 110 }}><TextField value={String(r.original_price ?? '')} onChangeText={(v: string) => updateRow(i, 'original_price', v)} placeholder="MRP" keyboardType="numeric" /></View>
                  <View style={{ width: 130 }}><TextField value={r.discounted_price == null ? '' : String(r.discounted_price)} onChangeText={(v: string) => updateRow(i, 'discounted_price', v)} placeholder="Discounted" keyboardType="numeric" /></View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12, color: C.textSec }}>Live</Text>
                    <Toggle value={r.available_today} onValueChange={(v: boolean) => updateRow(i, 'available_today', v)} />
                  </View>
                </View>
              </View>
              <Pressable onPress={() => removeRow(i)} style={styles.del}><Trash2 size={16} color={C.danger} /></Pressable>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: SP.sm, backgroundColor: C.bg, padding: 4, borderRadius: R.md },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: R.sm },
  tabActive: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textSec },
  help: { color: C.textSec, fontSize: 13, marginBottom: SP.md, lineHeight: 19 },
  row: { flexDirection: 'row', gap: SP.md, alignItems: 'flex-start', paddingVertical: SP.md, borderBottomWidth: 1, borderBottomColor: C.border },
  thumb: { width: 50, height: 50, borderRadius: R.md, backgroundColor: C.surfaceAlt },
  thumbEmpty: { borderWidth: 1, borderColor: C.borderStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  del: { width: 32, height: 32, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
});

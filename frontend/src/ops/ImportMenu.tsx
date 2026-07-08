import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FileSpreadsheet, Trash2 } from 'lucide-react-native';
import { opsApi } from '../api/opsApi';
import { C, SP, R } from './theme';
import { Sheet, Btn, TextField, Toggle, Spinner, EmptyState } from './ui';

// Ops-only Excel/CSV menu import. Columns: Item, Description, Original Price, Veg/Non-Veg, Contains Egg.
// Discounted (surplus) price is added later by Ops; vendors create surplus drops themselves.
export function ImportMenu({ visible, onClose, vendorId, onDone }: any) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setRows(null); setErr(''); setLoading(false); };
  const close = () => { reset(); onClose(); };

  const pickSheet = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (r.canceled) return;
    setErr(''); setLoading(true);
    try {
      const res = await opsApi.parseMenuFile(r.assets[0].uri, r.assets[0].name);
      const items = (res.items || []).map((x: any) => ({
        name: x.name || '', description: x.description || '',
        original_price: x.original_price ?? '', food_type: x.food_type || 'veg',
        contains_egg: !!x.contains_egg,
      }));
      if (!items.length) setErr('No items found. Check the columns: Item, Description, Original Price, Veg/Non-Veg, Contains Egg.');
      setRows(items);
    } catch (e: any) { setErr(e.message || 'Failed to parse file'); }
    finally { setLoading(false); }
  };

  const updateRow = (i: number, k: string, v: any) => setRows((p) => p!.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const removeRow = (i: number) => setRows((p) => p!.filter((_, idx) => idx !== i));

  const save = async () => {
    const valid = (rows || []).filter((r) => r.name?.trim() && Number(r.original_price) > 0);
    if (!valid.length) { setErr('Add at least one item with a name and price'); return; }
    setSaving(true);
    try { const res = await opsApi.bulkAddMenu(vendorId, valid); reset(); onDone(res.created); }
    catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Sheet visible={visible} onClose={close} title="Import Menu (Excel / CSV)" wide
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
        loading ? <Spinner label="Parsing file…" /> : (
          <View style={{ paddingVertical: SP.md }}>
            <Text style={styles.help}>
              Upload a CSV or Excel (.xlsx) file with these columns:{'\n'}
              <Text style={{ fontWeight: '700', color: C.text }}>Item</Text>, Description (optional),{' '}
              <Text style={{ fontWeight: '700', color: C.text }}>Original Price</Text>, Veg/Non-Veg, Contains Egg.
            </Text>
            <Text style={[styles.help, { marginBottom: SP.md }]}>
              The discounted (surplus) price is added later — vendors create surplus drops themselves.
            </Text>
            <Btn title="Upload CSV / Excel" icon={FileSpreadsheet} variant="secondary" onPress={pickSheet} />
            {err ? <Text style={{ color: C.danger, marginTop: SP.md }}>{err}</Text> : null}
          </View>
        )
      )}

      {rows && (
        <View>
          <Text style={styles.help}>Review the items, then save. You can set the surplus/discounted price afterwards.</Text>
          {err ? <Text style={{ color: C.danger, marginBottom: SP.sm }}>{err}</Text> : null}
          {rows.length === 0 ? <EmptyState title="Nothing to review" /> : rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <View style={{ flex: 1, gap: 6, minWidth: 220 }}>
                <TextField value={r.name} onChangeText={(v: string) => updateRow(i, 'name', v)} placeholder="Item name" />
                <TextField value={r.description} onChangeText={(v: string) => updateRow(i, 'description', v)} placeholder="Description (optional)" />
                <View style={{ flexDirection: 'row', gap: SP.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                  <View style={{ width: 120 }}>
                    <TextField value={String(r.original_price ?? '')} onChangeText={(v: string) => updateRow(i, 'original_price', v)} placeholder="Price ₹" keyboardType="numeric" />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12, color: C.textSec }}>{r.food_type === 'non_veg' ? 'Non-Veg' : 'Veg'}</Text>
                    <Toggle value={r.food_type !== 'non_veg'} onValueChange={(v: boolean) => updateRow(i, 'food_type', v ? 'veg' : 'non_veg')} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12, color: C.textSec }}>Egg</Text>
                    <Toggle value={r.contains_egg} onValueChange={(v: boolean) => updateRow(i, 'contains_egg', v)} />
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
  help: { color: C.textSec, fontSize: 13, marginBottom: SP.md, lineHeight: 19 },
  row: { flexDirection: 'row', gap: SP.md, alignItems: 'flex-start', paddingVertical: SP.md, borderBottomWidth: 1, borderBottomColor: C.border },
  del: { width: 32, height: 32, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
});

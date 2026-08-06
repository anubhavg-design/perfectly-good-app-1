import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Images, Download, FileArchive, CheckCircle2, XCircle } from 'lucide-react-native';
import { opsApi } from '../api/opsApi';
import { C, SP } from './theme';
import { Sheet, Btn, Spinner } from './ui';

// Ops-only bulk image upload for a vendor. Matches image filenames (minus extension)
// to existing menu item names (case-insensitive) and updates ONLY the image field.
export function BulkImages({ visible, onClose, vendorId, itemNames = [], onDone }: any) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');

  const close = () => { setResult(null); setErr(''); onClose(); };

  const downloadNames = async () => {
    if (!itemNames.length) { setErr('This vendor has no menu items yet.'); return; }
    const text = 'Name each image file exactly like these menu items (add an extension, e.g. .jpg):\n\n' + itemNames.join('\n');
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'menu-item-names.txt'; a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const uri = `${FileSystem.cacheDirectory}menu-item-names.txt`;
      await FileSystem.writeAsStringAsync(uri, text);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: 'Menu item names' });
    } catch (e: any) { setErr(e.message || 'Could not export names'); }
  };

  const pickAndUpload = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    setErr(''); setUploading(true);
    try {
      const res = await opsApi.bulkUploadImages(vendorId, r.assets[0].uri, r.assets[0].name || 'images.zip');
      setResult(res);
      onDone?.();
    } catch (e: any) { setErr(e.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <Sheet visible={visible} onClose={close} title="Bulk Upload Images" wide>
      {result ? (
        <View style={{ gap: SP.sm }}>
          <View style={styles.sumRow}><CheckCircle2 size={18} color={C.success} /><Text style={styles.ok}>{result.updated_count} image(s) matched and updated</Text></View>
          <View style={styles.sumRow}><XCircle size={18} color={C.textMute} /><Text style={styles.skip}>{result.skipped?.length || 0} skipped</Text></View>
          {result.skipped?.length ? (
            <>
              <Text style={styles.subhead}>Fix these file names and re-upload:</Text>
              {result.skipped.map((s: any, i: number) => (
                <View key={i} style={styles.skipItem}>
                  <Text style={styles.skipName} numberOfLines={1}>{s.filename}</Text>
                  <Text style={styles.skipReason}>{s.reason}</Text>
                </View>
              ))}
            </>
          ) : null}
          <View style={{ flexDirection: 'row', gap: SP.sm, marginTop: SP.md }}>
            <Btn title="Upload Another" variant="secondary" small onPress={() => setResult(null)} />
            <Btn title="Done" small onPress={close} />
          </View>
        </View>
      ) : uploading ? <Spinner label="Uploading & matching images…" /> : (
        <View style={{ paddingVertical: SP.md, gap: SP.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Images size={18} color={C.primary} />
            <Text style={styles.title}>How to name your images</Text>
          </View>
          <Text style={styles.help}>
            Put the photos in a ZIP. Name each image exactly like the menu item, e.g.{' '}
            <Text style={{ fontWeight: '700', color: C.text }}>Chocolate Cake Slice.jpg</Text>. Matching ignores capitalisation.
            Only the image is updated — no other field changes and no new items are created.
          </Text>
          <Btn title="Download menu item names" icon={Download} variant="secondary" small onPress={downloadNames} />
          <View style={{ height: SP.sm }} />
          <Btn title="Upload ZIP of Images" icon={FileArchive} onPress={pickAndUpload} />
          {err ? <Text style={{ color: C.danger, marginTop: SP.sm }}>{err}</Text> : null}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: C.text },
  help: { color: C.textSec, fontSize: 13, lineHeight: 19, marginBottom: SP.sm },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  ok: { fontSize: 15, fontWeight: '700', color: C.success },
  skip: { fontSize: 15, fontWeight: '600', color: C.textSec },
  subhead: { fontSize: 13, fontWeight: '700', color: C.textSec, marginTop: SP.sm },
  skipItem: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  skipName: { fontSize: 13.5, fontWeight: '600', color: C.text },
  skipReason: { fontSize: 12, color: C.textMute },
});

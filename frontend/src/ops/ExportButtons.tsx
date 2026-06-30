import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Download } from 'lucide-react-native';
import { downloadExport } from '../api/opsApi';
import { C, SP, R } from './theme';

export function ExportButtons({ entity }: { entity: string }) {
  const go = async (fmt: 'csv' | 'xlsx') => {
    try { await downloadExport(entity, fmt); } catch (e: any) { alert(e.message || 'Export failed'); }
  };
  return (
    <View style={styles.wrap}>
      <Download size={15} color={C.textSec} />
      <Pressable onPress={() => go('csv')} style={styles.btn}><Text style={styles.txt}>CSV</Text></Pressable>
      <View style={styles.sep} />
      <Pressable onPress={() => go('xlsx')} style={styles.btn}><Text style={styles.txt}>Excel</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.borderStrong, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.surface },
  btn: { paddingHorizontal: 4 },
  txt: { fontSize: 13, fontWeight: '700', color: C.text },
  sep: { width: 1, height: 16, backgroundColor: C.border },
});

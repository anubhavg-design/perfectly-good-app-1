import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  Modal, ScrollView, Switch, Image,
} from 'react-native';
import { ChevronDown, X, Check } from 'lucide-react-native';
import { C, SP, R } from './theme';

export function Spinner({ label }: { label?: string }) {
  return (
    <View style={{ padding: SP.xxl, alignItems: 'center' }}>
      <ActivityIndicator size="large" color={C.primary} />
      {label ? <Text style={{ marginTop: SP.md, color: C.textSec }}>{label}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: any) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type BtnProps = {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: any; loading?: boolean; disabled?: boolean; small?: boolean; full?: boolean;
};
export function Btn({ title, onPress, variant = 'primary', icon: Icon, loading, disabled, small, full }: BtnProps) {
  const bg = variant === 'primary' ? C.primary : variant === 'danger' ? C.danger : variant === 'ghost' ? 'transparent' : C.surface;
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'ghost' ? C.textSec : C.text;
  const border = variant === 'secondary' ? C.borderStrong : 'transparent';
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === 'secondary' ? 1 : 0, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        small && { paddingVertical: 7, paddingHorizontal: 12 },
        full && { alignSelf: 'stretch' },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {Icon ? <Icon size={small ? 15 : 17} color={fg} /> : null}
          <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 14 }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'danger' | 'warn' | 'info' }) {
  const map: any = {
    neutral: [C.surfaceAlt, C.textSec], success: [C.successSoft, C.success],
    danger: [C.dangerSoft, C.danger], warn: [C.warnSoft, C.warn], info: [C.infoSoft, C.info],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.full, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Field({ label, children, required }: any) {
  return (
    <View style={{ marginBottom: SP.md, flex: 1, minWidth: 180 }}>
      <Text style={styles.label}>{label}{required ? <Text style={{ color: C.danger }}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

export function TextField({ value, onChangeText, placeholder, keyboardType, multiline, secureTextEntry }: any) {
  return (
    <TextInput
      value={value === undefined || value === null ? '' : String(value)}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={C.textMute}
      keyboardType={keyboardType}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      style={[styles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
    />
  );
}

export function Toggle({ value, onValueChange }: any) {
  return (
    <Switch
      value={!!value}
      onValueChange={onValueChange}
      trackColor={{ false: '#CBD5D0', true: C.primary }}
      thumbColor="#fff"
    />
  );
}

export function Dropdown({ value, options, onChange, placeholder }: {
  value?: string; options: { label: string; value: string }[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: current ? C.text : C.textMute, fontSize: 14 }}>{current ? current.label : (placeholder || 'Select')}</Text>
          <ChevronDown size={16} color={C.textMute} />
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.dropdownPanel}>
            <ScrollView>
              {options.map((o) => (
                <Pressable key={o.value} style={styles.dropdownItem} onPress={() => { onChange(o.value); setOpen(false); }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>{o.label}</Text>
                  {o.value === value ? <Check size={16} color={C.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function Chips({ value, options, onChange }: { value?: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <Pressable key={o} onPress={() => onChange(o)}
            style={[styles.chip, active && { backgroundColor: C.primary, borderColor: C.primary }]}>
            <Text style={{ color: active ? '#fff' : C.textSec, fontSize: 13, fontWeight: '600' }}>
              {o.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sheet({ visible, onClose, title, children, footer, wide }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, wide && { maxWidth: 720 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={22} color={C.textSec} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ padding: SP.lg }}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel, danger, loading }: any) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title}
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SP.sm }}>
          <Btn title="Cancel" variant="secondary" small onPress={onCancel} />
          <Btn title={confirmLabel || 'Confirm'} variant={danger ? 'danger' : 'primary'} small onPress={onConfirm} loading={loading} />
        </View>
      }>
      <Text style={{ color: C.textSec, fontSize: 14, lineHeight: 20 }}>{message}</Text>
    </Sheet>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ padding: SP.xxl, alignItems: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{title}</Text>
      {subtitle ? <Text style={{ marginTop: 4, color: C.textMute, fontSize: 13 }}>{subtitle}</Text> : null}
    </View>
  );
}

export type Col = { key: string; label: string; width?: number; render?: (row: any) => any };
export function DataTable({ columns, rows, keyField = 'id' }: { columns: Col[]; rows: any[]; keyField?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ minWidth: '100%' }}>
        <View style={styles.tableHeader}>
          {columns.map((c) => (
            <View key={c.key} style={{ width: c.width || 140, paddingHorizontal: SP.md }}>
              <Text style={styles.th}>{c.label}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, i) => (
          <View key={row[keyField] || i} style={[styles.tr, i % 2 ? { backgroundColor: C.surfaceAlt } : null]}>
            {columns.map((c) => (
              <View key={c.key} style={{ width: c.width || 140, paddingHorizontal: SP.md, justifyContent: 'center' }}>
                {c.render ? c.render(row) : <Text style={styles.td} numberOfLines={2}>{String(row[c.key] ?? '—')}</Text>}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function PageHeader({ title, subtitle, right }: any) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Avatar({ uri, size = 44, label }: { uri?: string; size?: number; label?: string }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: R.md, backgroundColor: C.surfaceAlt }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: R.md, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.primaryDark, fontWeight: '800', fontSize: size * 0.4 }}>{(label || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: SP.lg },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12.5, fontWeight: '700', color: C.textSec, marginBottom: 6 },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong, borderRadius: R.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,18,0.45)', alignItems: 'center', justifyContent: 'center', padding: SP.lg },
  dropdownPanel: { backgroundColor: '#fff', borderRadius: R.md, width: 320, maxHeight: 360, paddingVertical: SP.xs, borderWidth: 1, borderColor: C.border },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.lg, paddingVertical: 12 },
  sheet: { backgroundColor: '#fff', borderRadius: R.xl, width: '100%', maxWidth: 520, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SP.lg, borderBottomWidth: 1, borderBottomColor: C.border },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  sheetFooter: { padding: SP.lg, borderTopWidth: 1, borderTopColor: C.border },
  tableHeader: { flexDirection: 'row', backgroundColor: C.surfaceAlt, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: SP.md },
  th: { fontSize: 11.5, fontWeight: '800', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: SP.md, minHeight: 52, alignItems: 'center' },
  td: { fontSize: 13.5, color: C.text },
  pageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SP.lg, gap: SP.md, flexWrap: 'wrap' },
  pageTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  pageSub: { fontSize: 13.5, color: C.textMute, marginTop: 2 },
});

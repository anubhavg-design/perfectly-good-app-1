import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { X, Plus, Trash2 } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, titleCase, hasPerm, fmtDate } from '../../src/ops/theme';
import { Card, Btn, Badge, Field, TextField, Dropdown, Spinner, PageHeader, Sheet, ConfirmDialog, EmptyState } from '../../src/ops/ui';
import { useAuth } from '../../src/context/AuthContext';

const PCT = ['commission_rate', 'gst_on_commission', 'gst_rate', 'convenience_rate'];

export default function Settings() {
  const { user } = useAuth();
  const canSettings = hasPerm(user, 'manage_settings');
  const canRoles = hasPerm(user, 'manage_roles');

  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [staff, setStaff] = useState<any[]>([]);
  const [rolesInfo, setRolesInfo] = useState<any>(null);
  const [addStaff, setAddStaff] = useState(false);
  const [sform, setSform] = useState<any>({ name: '', email: '', password: '', role: 'operations' });
  const [delStaff, setDelStaff] = useState<any>(null);

  useEffect(() => {
    opsApi.settings().then((s) => {
      const c = { ...s };
      PCT.forEach((k) => { c[k] = Math.round((s[k] ?? 0) * 100); });
      setCfg(c);
    }).catch(() => {}).finally(() => setLoading(false));
    opsApi.roles().then(setRolesInfo).catch(() => {});
    if (canRoles) opsApi.staff().then(setStaff).catch(() => {});
  }, []);

  if (loading || !cfg) return <Spinner label="Loading settings…" />;

  const set = (k: string, v: any) => setCfg((p: any) => ({ ...p, [k]: v }));
  const editArray = (k: string, arr: string[]) => set(k, arr);

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = { ...cfg };
      PCT.forEach((k) => { payload[k] = (Number(cfg[k]) || 0) / 100; });
      payload.default_discount_pct = Number(cfg.default_discount_pct) || 0;
      delete payload._id;
      await opsApi.updateSettings(payload);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const createStaff = async () => {
    if (!sform.name.trim() || !sform.email.trim()) return alert('Name and email required');
    try { await opsApi.createStaff(sform); setAddStaff(false); setSform({ name: '', email: '', password: '', role: 'operations' }); setStaff(await opsApi.staff()); }
    catch (e: any) { alert(e.message); }
  };
  const changeRole = async (u: any, role: string) => { await opsApi.updateStaffRole(u.user_id, { role }); setStaff(await opsApi.staff()); };
  const removeStaff = async () => { try { await opsApi.deleteStaff(delStaff.user_id); setDelStaff(null); setStaff(await opsApi.staff()); } catch (e: any) { alert(e.message); } };

  return (
    <View>
      <PageHeader title="Settings" subtitle="Platform configuration & team" right={canSettings ? <Btn title={saved ? 'Saved ✓' : 'Save Changes'} onPress={save} loading={saving} /> : undefined} />

      <Card style={{ marginBottom: SP.lg }}>
        <Text style={styles.cardTitle}>Commission & Pricing</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
          <Field label="Platform Commission (%)"><TextField value={cfg.commission_rate} onChangeText={(v: string) => set('commission_rate', v)} keyboardType="numeric" /></Field>
          <Field label="GST on Commission (%)"><TextField value={cfg.gst_on_commission} onChangeText={(v: string) => set('gst_on_commission', v)} keyboardType="numeric" /></Field>
          <Field label="GST on Order (%)"><TextField value={cfg.gst_rate} onChangeText={(v: string) => set('gst_rate', v)} keyboardType="numeric" /></Field>
          <Field label="Convenience Fee (%)"><TextField value={cfg.convenience_rate} onChangeText={(v: string) => set('convenience_rate', v)} keyboardType="numeric" /></Field>
          <Field label="Default Discount (%)"><TextField value={cfg.default_discount_pct} onChangeText={(v: string) => set('default_discount_pct', v)} keyboardType="numeric" /></Field>
        </View>
        {!canSettings ? <Text style={styles.readonly}>You have read-only access to settings.</Text> : null}
      </Card>

      <Card style={{ marginBottom: SP.lg }}>
        <Text style={styles.cardTitle}>Categories</Text>
        <ChipEditor items={cfg.categories || []} onChange={(a) => editArray('categories', a)} editable={canSettings} placeholder="Add category" />
      </Card>
      <Card style={{ marginBottom: SP.lg }}>
        <Text style={styles.cardTitle}>Pickup Time Slots</Text>
        <ChipEditor items={cfg.pickup_slots || []} onChange={(a) => editArray('pickup_slots', a)} editable={canSettings} placeholder="e.g. 18:00-21:00" />
      </Card>
      <Card style={{ marginBottom: SP.lg }}>
        <Text style={styles.cardTitle}>Service Types</Text>
        <ChipEditor items={cfg.service_types || []} onChange={(a) => editArray('service_types', a)} editable={canSettings} placeholder="Add service type" />
      </Card>

      {canRoles && (
        <Card style={{ marginBottom: SP.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.md }}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Admin & Team Members</Text>
            <Btn title="Add Member" icon={Plus} small onPress={() => setAddStaff(true)} />
          </View>
          {staff.length === 0 ? <EmptyState title="No staff yet" /> : staff.map((s) => (
            <View key={s.user_id} style={styles.staffRow}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ fontWeight: '700', color: C.text }}>{s.name}</Text>
                <Text style={{ color: C.textMute, fontSize: 12.5 }}>{s.email}</Text>
              </View>
              <View style={{ width: 190 }}>
                <Dropdown value={s.role} onChange={(r) => changeRole(s, r)}
                  options={['admin', 'operations', 'customer_success', 'finance'].map((r) => ({ label: titleCase(r), value: r }))} />
              </View>
              <Pressable onPress={() => setDelStaff(s)} style={styles.delBtn}><Trash2 size={16} color={C.danger} /></Pressable>
            </View>
          ))}
        </Card>
      )}

      {rolesInfo && (
        <Card style={{ marginBottom: SP.xxl }}>
          <Text style={styles.cardTitle}>Roles & Permissions</Text>
          {Object.entries(rolesInfo.roles || {}).map(([role, perms]: any) => (
            <View key={role} style={styles.roleRow}>
              <Text style={{ fontWeight: '700', color: C.text, width: 150 }}>{titleCase(role)}</Text>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {perms.map((p: string) => <Badge key={p} label={titleCase(p)} tone="neutral" />)}
              </View>
            </View>
          ))}
        </Card>
      )}

      <Sheet visible={addStaff} onClose={() => setAddStaff(false)} title="Add Team Member"
        footer={<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SP.sm }}>
          <Btn title="Cancel" variant="secondary" small onPress={() => setAddStaff(false)} />
          <Btn title="Create" small onPress={createStaff} />
        </View>}>
        <Field label="Name" required><TextField value={sform.name} onChangeText={(v: string) => setSform((p: any) => ({ ...p, name: v }))} /></Field>
        <Field label="Email" required><TextField value={sform.email} onChangeText={(v: string) => setSform((p: any) => ({ ...p, email: v }))} keyboardType="email-address" /></Field>
        <Field label="Password"><TextField value={sform.password} onChangeText={(v: string) => setSform((p: any) => ({ ...p, password: v }))} placeholder="Auto-generated if empty" /></Field>
        <Field label="Role"><Dropdown value={sform.role} onChange={(r) => setSform((p: any) => ({ ...p, role: r }))}
          options={['admin', 'operations', 'customer_success', 'finance'].map((r) => ({ label: titleCase(r), value: r }))} /></Field>
      </Sheet>

      <ConfirmDialog visible={!!delStaff} title="Remove team member?" danger
        message={`Remove ${delStaff?.name} (${delStaff?.email})? They will lose dashboard access.`}
        confirmLabel="Remove" onConfirm={removeStaff} onCancel={() => setDelStaff(null)} />
    </View>
  );
}

function ChipEditor({ items, onChange, editable, placeholder }: any) {
  const [val, setVal] = useState('');
  const add = () => { const v = val.trim(); if (v && !items.includes(v)) { onChange([...items, v]); setVal(''); } };
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginBottom: editable ? SP.md : 0 }}>
        {items.map((it: string) => (
          <View key={it} style={styles.editChip}>
            <Text style={{ color: C.text, fontSize: 13 }}>{it}</Text>
            {editable && <Pressable onPress={() => onChange(items.filter((x: string) => x !== it))} hitSlop={6}><X size={14} color={C.textMute} /></Pressable>}
          </View>
        ))}
        {items.length === 0 ? <Text style={{ color: C.textMute }}>None</Text> : null}
      </View>
      {editable && (
        <View style={{ flexDirection: 'row', gap: SP.sm }}>
          <TextInput value={val} onChangeText={setVal} placeholder={placeholder} placeholderTextColor={C.textMute} style={styles.addInput} onSubmitEditing={add} />
          <Btn title="Add" small variant="secondary" onPress={add} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: SP.md },
  readonly: { color: C.textMute, fontSize: 12.5, marginTop: SP.sm },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.full },
  addInput: { flex: 1, maxWidth: 280, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, color: C.text, outlineStyle: 'none' as any },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingVertical: SP.sm, borderBottomWidth: 1, borderBottomColor: C.border, flexWrap: 'wrap' },
  delBtn: { width: 34, height: 34, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  roleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SP.md, paddingVertical: SP.sm, borderBottomWidth: 1, borderBottomColor: C.border },
});

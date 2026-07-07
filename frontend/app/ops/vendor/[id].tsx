import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Linking, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Pencil, Plus, Copy, Trash2, MapPin, Phone, Mail, Store, ExternalLink, Sparkles } from 'lucide-react-native';
import { opsApi } from '../../../src/api/opsApi';
import { C, SP, R, money, fmtDate, fmtDateTime, titleCase, hasPerm } from '../../../src/ops/theme';
import { Card, Btn, Badge, Spinner, Sheet, ConfirmDialog, Toggle, DataTable, EmptyState } from '../../../src/ops/ui';
import { VendorForm, MenuItemForm } from '../../../src/ops/forms';
import { ImportMenu } from '../../../src/ops/ImportMenu';
import { ExportButtons } from '../../../src/ops/ExportButtons';
import { useAuth } from '../../../src/context/AuthContext';

export default function VendorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canMenu = hasPerm(user, 'manage_menu');
  const canVendor = hasPerm(user, 'manage_vendors');
  const canNote = hasPerm(user, 'add_notes');
  const canFinance = hasPerm(user, 'view_finance');

  const [v, setV] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [editVendor, setEditVendor] = useState(false);
  const [itemForm, setItemForm] = useState<any>(null); // {} for new, item for edit
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);
  const [note, setNote] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [perf, setPerf] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setV(await opsApi.vendor(id)); } catch (e) {} finally { setLoading(false); }
    opsApi.vendorPerformance(id).then(setPerf).catch(() => {});
  }, [id]);

  useEffect(() => { opsApi.settings().then((s) => setCategories(s.categories || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner label="Loading vendor…" />;
  if (!v) return <EmptyState title="Vendor not found" />;

  const saveVendor = async (f: any) => {
    setSaving(true);
    try { await opsApi.updateVendor(id!, f); setEditVendor(false); await load(); }
    catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };
  const saveItem = async (f: any) => {
    setSaving(true);
    try {
      if (itemForm?.menu_item_id) await opsApi.updateMenuItem(itemForm.menu_item_id, f);
      else await opsApi.addMenuItem(id!, f);
      setItemForm(null); await load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };
  const toggleItem = async (item: any) => { await opsApi.toggleItem(item.menu_item_id, !item.available_today); await load(); };
  const duplicateItem = async (item: any) => { await opsApi.duplicateItem(item.menu_item_id); await load(); };
  const deleteItem = async () => { setSaving(true); try { await opsApi.deleteItem(confirm.menu_item_id); setConfirm(null); await load(); } finally { setSaving(false); } };
  const addNote = async () => { if (!note.trim()) return; await opsApi.addNote(id!, note.trim()); setNote(''); await load(); };
  const toggleStatus = async () => { await opsApi.vendorStatus(id!, v.status === 'inactive' ? 'active' : 'inactive'); await load(); };

  return (
    <View>
      <Pressable onPress={() => router.push('/ops/vendors')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SP.md }}>
        <ChevronLeft size={18} color={C.textSec} /><Text style={{ color: C.textSec, fontWeight: '600' }}>Back to Vendors</Text>
      </Pressable>

      {/* Header */}
      <Card style={{ marginBottom: SP.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SP.md, flexWrap: 'wrap' }}>
          <View style={styles.vendorIcon}><Store size={26} color={C.primaryDark} /></View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, flexWrap: 'wrap' }}>
              <Text style={styles.vName}>{v.name}</Text>
              <Badge label={titleCase(v.status || 'active')} tone={v.status === 'inactive' ? 'danger' : 'success'} />
            </View>
            <Text style={{ color: C.textSec, marginTop: 2 }}>{v.category} · {titleCase(v.service_type)} · Owner: {v.owner_name || '—'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            {canVendor && <Btn title={v.status === 'inactive' ? 'Activate' : 'Deactivate'} variant="secondary" small onPress={toggleStatus} />}
            {canVendor && <Btn title="Edit" icon={Pencil} small onPress={() => setEditVendor(true)} />}
          </View>
        </View>

        <View style={styles.infoGrid}>
          <Info icon={Phone} label="Phone" value={v.phone || '—'} />
          <Info icon={Phone} label="Restaurant Phone" value={v.restaurant_phone || '—'} />
          <Info icon={Mail} label="Email" value={v.email || '—'} />
          <Info icon={MapPin} label="Address" value={v.full_address || '—'} />
          <Info label="Assigned Ops" value={v.assigned_ops || 'Unassigned'} />
          <Info label="Pickup Window" value={`${v.pickup_start_time || '—'} – ${v.pickup_end_time || '—'}`} />
          <Info label="Created" value={fmtDate(v.created_at)} />
          <Info label="Last Updated" value={fmtDate(v.updated_at)} />
          <Info label="Last Order" value={fmtDate(v.last_order_date)} />
        </View>
        {v.maps_link ? (
          <Pressable onPress={() => Linking.openURL(v.maps_link)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SP.md }}>
            <ExternalLink size={15} color={C.primary} /><Text style={{ color: C.primary, fontWeight: '600' }}>Open in Google Maps</Text>
          </Pressable>
        ) : null}
      </Card>

      {/* Stats */}
      <View style={styles.statRow}>
        <Stat label="Total Orders" value={v.total_orders ?? 0} />
        <Stat label="Completed" value={v.completed_orders ?? 0} />
        <Stat label="Revenue" value={money(v.revenue)} />
        <Stat label="Commission" value={money(v.commission)} />
        {canFinance && <Stat label="Net Payable" value={money(v.net_payable)} />}
        {canFinance && <Stat label="Pending Payout" value={money(v.pending_payout)} accent />}
      </View>

      {/* Vendor Performance */}
      {perf && (
        <>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Vendor Performance</Text></View>
          <View style={styles.statRow}>
            <Stat label="Orders (7d)" value={perf.orders_week ?? 0} />
            <Stat label="Orders (30d)" value={perf.orders_month ?? 0} />
            <Stat label="Avg Order Value" value={money(perf.aov)} />
            <Stat label="Active Today" value={`${perf.active_listings_today ?? 0} / ${perf.total_listings ?? 0}`} />
            <Stat label="Best Seller" value={perf.best_selling_item ? `${perf.best_selling_item} (${perf.best_selling_qty})` : '—'} />
            <Stat label="Last Order" value={perf.last_order_date ? fmtDate(perf.last_order_date) : '—'} />
          </View>
        </>
      )}

      {/* Menu management */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Menu Items ({v.menu_items?.length || 0})</Text>
        {canMenu && (
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            <Btn title="Import" icon={Sparkles} variant="secondary" small onPress={() => setImportOpen(true)} />
            <Btn title="Add Item" icon={Plus} small onPress={() => setItemForm({})} />
          </View>
        )}
      </View>
      <View style={{ gap: SP.md }}>
        {(v.menu_items || []).length === 0 ? (
          <Card><EmptyState title="No menu items yet" subtitle="Add the vendor's first item to start" /></Card>
        ) : v.menu_items.map((it: any) => (
          <Card key={it.menu_item_id} style={styles.itemCard}>
            <Image source={{ uri: it.image_url }} style={styles.itemImg} />
            <View style={{ flex: 1, minWidth: 160 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, flexWrap: 'wrap' }}>
                <Text style={styles.itemName}>{it.name}</Text>
                <Badge label={it.food_type === 'non_veg' ? 'Non-Veg' : 'Veg'} tone={it.food_type === 'non_veg' ? 'danger' : 'success'} />
                {it.contains_egg ? <Badge label="Egg" tone="warn" /> : null}
              </View>
              <Text style={{ color: C.textMute, fontSize: 12.5 }} numberOfLines={1}>{it.description || '—'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginTop: 4 }}>
                <Text style={{ fontWeight: '800', color: C.text }}>{money(it.discounted_price)}</Text>
                <Text style={{ color: C.textMute, textDecorationLine: 'line-through', fontSize: 12.5 }}>{money(it.original_price)}</Text>
                {it.serving_size ? <Text style={{ color: C.textSec, fontSize: 12 }}>· {it.serving_size}</Text> : null}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: SP.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12, color: it.available_today ? C.success : C.textMute, fontWeight: '700' }}>{it.available_today ? 'Live' : 'Off'}</Text>
                <Toggle value={it.available_today} onValueChange={() => canMenu && toggleItem(it)} />
              </View>
              {canMenu && (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Mini icon={Pencil} onPress={() => setItemForm(it)} />
                  <Mini icon={Copy} onPress={() => duplicateItem(it)} />
                  <Mini icon={Trash2} color={C.danger} onPress={() => setConfirm(it)} />
                </View>
              )}
            </View>
          </Card>
        ))}
      </View>

      {/* Notes */}
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Internal Notes</Text></View>
      <Card>
        {canNote && (
          <View style={{ flexDirection: 'row', gap: SP.sm, marginBottom: SP.md }}>
            <TextInput value={note} onChangeText={setNote} placeholder="Add an internal note…" placeholderTextColor={C.textMute} style={styles.noteInput} />
            <Btn title="Add" small onPress={addNote} />
          </View>
        )}
        {(v.notes || []).length === 0 ? <Text style={{ color: C.textMute }}>No notes yet.</Text> :
          [...v.notes].reverse().map((n: any, i: number) => (
            <View key={i} style={styles.note}>
              <Text style={{ color: C.text, fontSize: 13.5 }}>{n.note}</Text>
              <Text style={{ color: C.textMute, fontSize: 11.5, marginTop: 2 }}>{n.by} · {fmtDateTime(n.at)}</Text>
            </View>
          ))}
      </Card>

      {/* Payout history */}
      {canFinance && (
        <>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Payout History</Text></View>
          <Card style={{ padding: 0 }}>
            {(v.payout_history || []).length === 0 ? <EmptyState title="No payouts recorded" /> : (
              <DataTable keyField="payout_id" rows={v.payout_history} columns={[
                { key: 'created_at', label: 'Date', width: 150, render: (r: any) => <Text style={{ fontSize: 13 }}>{fmtDateTime(r.created_at)}</Text> },
                { key: 'amount', label: 'Amount', width: 110, render: (r: any) => <Text style={{ fontWeight: '700' }}>{money(r.amount)}</Text> },
                { key: 'method', label: 'Method', width: 120, render: (r: any) => <Text style={{ fontSize: 13 }}>{titleCase(r.method)}</Text> },
                { key: 'reference_number', label: 'Reference', width: 150 },
                { key: 'paid_by', label: 'Paid By', width: 130 },
                { key: 'notes', label: 'Notes', width: 200 },
              ]} />
            )}
          </Card>
        </>
      )}

      <View style={{ height: SP.xxl }} />

      <Sheet visible={editVendor} onClose={() => setEditVendor(false)} title="Edit Vendor" wide>
        <VendorForm initial={v} categories={categories} onSubmit={saveVendor} submitting={saving} />
      </Sheet>
      <Sheet visible={!!itemForm} onClose={() => setItemForm(null)} title={itemForm?.menu_item_id ? 'Edit Menu Item' : 'Add Menu Item'} wide>
        <MenuItemForm initial={itemForm} categories={categories} onSubmit={saveItem} submitting={saving} />
      </Sheet>
      <ImportMenu visible={importOpen} vendorId={id} onClose={() => setImportOpen(false)}
        onDone={async () => { setImportOpen(false); await load(); }} />
      <ConfirmDialog visible={!!confirm} title="Delete item?" danger loading={saving}
        message={`Delete "${confirm?.name}"? This cannot be undone.`} confirmLabel="Delete"
        onConfirm={deleteItem} onCancel={() => setConfirm(null)} />
    </View>
  );
}

function Info({ icon: Icon, label, value }: any) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {Icon ? <Icon size={14} color={C.textMute} /> : null}
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}
function Stat({ label, value, accent }: any) {
  return (
    <Card style={styles.statCard}>
      <Text style={[styles.statValue, accent && { color: C.warn }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}
function Mini({ icon: Icon, onPress, color = C.textSec }: any) {
  return <Pressable onPress={onPress} style={styles.mini}><Icon size={15} color={color} /></Pressable>;
}

const styles = StyleSheet.create({
  vendorIcon: { width: 56, height: 56, borderRadius: R.md, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  vName: { fontSize: 21, fontWeight: '800', color: C.text },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.lg, marginTop: SP.lg, paddingTop: SP.lg, borderTopWidth: 1, borderTopColor: C.border },
  info: { minWidth: 150 },
  infoLabel: { fontSize: 11.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', marginBottom: 3 },
  infoValue: { fontSize: 13.5, color: C.text, fontWeight: '500' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.md, marginBottom: SP.lg },
  statCard: { flexGrow: 1, minWidth: 130, paddingVertical: SP.md },
  statValue: { fontSize: 19, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 12, color: C.textSec, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SP.xl, marginBottom: SP.md },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: SP.md, flexWrap: 'wrap' },
  itemImg: { width: 56, height: 56, borderRadius: R.md, backgroundColor: C.surfaceAlt },
  itemName: { fontSize: 15, fontWeight: '700', color: C.text },
  mini: { width: 30, height: 30, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  noteInput: { flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 9, color: C.text, outlineStyle: 'none' as any },
  note: { paddingVertical: SP.sm, borderBottomWidth: 1, borderBottomColor: C.border },
});

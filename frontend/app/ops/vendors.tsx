import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Plus, Pencil, UtensilsCrossed, Power, Trash2, Search } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, money, fmtDate, titleCase, hasPerm } from '../../src/ops/theme';
import { Card, Btn, Badge, DataTable, Spinner, PageHeader, Sheet, ConfirmDialog, Chips, Dropdown, EmptyState } from '../../src/ops/ui';
import { VendorForm } from '../../src/ops/forms';
import { ExportButtons } from '../../src/ops/ExportButtons';
import { useAuth } from '../../src/context/AuthContext';

export default function Vendors() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const canManage = hasPerm(user, 'manage_vendors');
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await opsApi.listVendors({ search, category, status, page, page_size: 25 });
      setData(res);
    } catch (e) {} finally { setLoading(false); }
  }, [search, category, status, page]);

  useEffect(() => { opsApi.settings().then((s) => setCategories(s.categories || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (params.add === '1' && canManage) { setEditing(null); setShowForm(true); } }, [params.add]);

  const submitVendor = async (f: any) => {
    setSaving(true);
    try {
      if (editing) await opsApi.updateVendor(editing.vendor_id, f);
      else await opsApi.createVendor(f);
      setShowForm(false); setEditing(null);
      await load();
    } catch (e: any) { alert(e.message || 'Failed to save'); } finally { setSaving(false); }
  };

  const doToggleStatus = async (v: any) => {
    await opsApi.vendorStatus(v.vendor_id, v.status === 'inactive' ? 'active' : 'inactive');
    await load();
  };
  const doDelete = async () => {
    setSaving(true);
    try { await opsApi.deleteVendor(confirm.vendor_id); setConfirm(null); await load(); }
    catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'name', label: 'Vendor', width: 180, render: (r: any) => (
      <Pressable onPress={() => router.push(`/ops/vendor/${r.vendor_id}`)}>
        <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>{r.name}</Text>
        <Text style={{ color: C.textMute, fontSize: 12 }}>{r.owner_name || '—'}</Text>
      </Pressable>
    ) },
    { key: 'category', label: 'Category', width: 110 },
    { key: 'discount_percentage', label: 'Discount', width: 80, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.discount_percentage ? `${r.discount_percentage}%` : '—'}</Text> },
    { key: 'assigned_ops_name', label: 'Assigned Ops', width: 130, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{r.assigned_ops_name || 'Unassigned'}</Text> },
    { key: 'phone', label: 'Phone', width: 120, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.phone || '—'}</Text> },
    { key: 'service_type', label: 'Service', width: 90, render: (r: any) => <Text style={{ fontSize: 13 }}>{titleCase(r.service_type)}</Text> },
    { key: 'full_address', label: 'Address', width: 180, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }} numberOfLines={2}>{r.full_address || '—'}</Text> },
    { key: 'status', label: 'Status', width: 90, render: (r: any) => <Badge label={titleCase(r.status || 'active')} tone={r.status === 'inactive' ? 'danger' : 'success'} /> },
    { key: 'menu_count', label: 'Menu', width: 70, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.menu_count ?? 0}</Text> },
    { key: 'order_count', label: 'Orders', width: 70, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.order_count ?? 0}</Text> },
    { key: 'revenue', label: 'Revenue', width: 100, render: (r: any) => <Text style={{ fontSize: 13, fontWeight: '600' }}>{money(r.revenue)}</Text> },
    { key: 'created_at', label: 'Added', width: 110, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{fmtDate(r.created_at)}</Text> },
    { key: 'actions', label: 'Actions', width: 170, render: (r: any) => (
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <IconBtn icon={UtensilsCrossed} tip="Menu" onPress={() => router.push(`/ops/vendor/${r.vendor_id}`)} />
        {canManage && <IconBtn icon={Pencil} tip="Edit" onPress={() => { setEditing(r); setShowForm(true); }} />}
        {canManage && <IconBtn icon={Power} tip="Toggle" color={r.status === 'inactive' ? C.success : C.warn} onPress={() => doToggleStatus(r)} />}
        {isAdmin && <IconBtn icon={Trash2} tip="Delete" color={C.danger} onPress={() => setConfirm(r)} />}
      </View>
    ) },
  ];

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / 25));

  return (
    <View>
      <PageHeader title="Vendors" subtitle={`${data.total || 0} total`}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
            <ExportButtons entity="vendors" />
            {canManage ? <Btn title="Add Vendor" icon={Plus} onPress={() => { setEditing(null); setShowForm(true); }} /> : null}
          </View>
        } />

      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, flexWrap: 'wrap' }}>
          <View style={styles.searchBox}>
            <Search size={16} color={C.textMute} />
            <TextInput value={search} onChangeText={(t) => { setSearch(t); setPage(1); }} placeholder="Search vendors…" placeholderTextColor={C.textMute} style={styles.searchInput} />
          </View>
          <View style={{ width: 170 }}>
            <Dropdown value={category} onChange={(v) => { setCategory(v); setPage(1); }} placeholder="All categories"
              options={[{ label: 'All categories', value: '' }, ...categories.map((c) => ({ label: c, value: c }))]} />
          </View>
          <Chips value={status} options={['', 'active', 'inactive']} onChange={(v) => { setStatus(v); setPage(1); }} />
        </View>
      </Card>

      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length ? <DataTable columns={columns} rows={data.items} keyField="vendor_id" /> : <EmptyState title="No vendors found" subtitle="Try adjusting filters or add a vendor" />)}
      </Card>

      {totalPages > 1 && (
        <View style={styles.pager}>
          <Btn title="Previous" variant="secondary" small disabled={page <= 1} onPress={() => setPage((p) => p - 1)} />
          <Text style={{ color: C.textSec, fontSize: 13 }}>Page {page} of {totalPages}</Text>
          <Btn title="Next" variant="secondary" small disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)} />
        </View>
      )}

      <Sheet visible={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Edit Vendor' : 'Add Vendor'} wide>
        <VendorForm initial={editing} categories={categories} onSubmit={submitVendor} submitting={saving} />
      </Sheet>

      <ConfirmDialog visible={!!confirm} title="Delete vendor?" danger loading={saving}
        message={`This permanently removes "${confirm?.name}", its login and all menu items. This cannot be undone.`}
        confirmLabel="Delete" onConfirm={doDelete} onCancel={() => setConfirm(null)} />
    </View>
  );
}

function IconBtn({ icon: Icon, onPress, color = C.textSec, tip }: any) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn} accessibilityLabel={tip}>
      <Icon size={16} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBox: { flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: SP.sm, backgroundColor: C.bg, borderRadius: R.md, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: 14, color: C.text, outlineStyle: 'none' as any },
  iconBtn: { width: 32, height: 32, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.lg, marginTop: SP.lg },
});

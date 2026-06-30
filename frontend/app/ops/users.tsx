import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, money, fmtDate } from '../../src/ops/theme';
import { Card, DataTable, Spinner, PageHeader, EmptyState, Btn } from '../../src/ops/ui';

export default function UsersPage() {
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.listUsers({ search, page, page_size: 25 })); } catch {} finally { setLoading(false); }
  }, [search, page]);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'name', label: 'Customer', width: 180, render: (r: any) => <Text style={{ fontWeight: '700', fontSize: 14 }}>{r.name || '—'}</Text> },
    { key: 'email', label: 'Email', width: 220 },
    { key: 'phone', label: 'Phone', width: 130, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.phone || '—'}</Text> },
    { key: 'orders', label: 'Orders', width: 90, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.orders ?? 0}</Text> },
    { key: 'money_saved', label: 'Money Saved', width: 130, render: (r: any) => <Text style={{ fontWeight: '700', color: C.success }}>{money(r.money_saved)}</Text> },
    { key: 'created_at', label: 'Joined', width: 120, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{fmtDate(r.created_at)}</Text> },
  ];

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / 25));

  return (
    <View>
      <PageHeader title="Customers" subtitle={`${data.total || 0} registered`} />
      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <View style={styles.searchBox}>
          <Search size={16} color={C.textMute} />
          <TextInput value={search} onChangeText={(t) => { setSearch(t); setPage(1); }} placeholder="Search by name, email or phone…" placeholderTextColor={C.textMute} style={styles.searchInput} />
        </View>
      </Card>
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length ? <DataTable columns={columns} rows={data.items} keyField="user_id" /> : <EmptyState title="No customers found" />)}
      </Card>
      {totalPages > 1 && (
        <View style={styles.pager}>
          <Btn title="Previous" variant="secondary" small disabled={page <= 1} onPress={() => setPage((p) => p - 1)} />
          <Text style={{ color: C.textSec }}>Page {page} of {totalPages}</Text>
          <Btn title="Next" variant="secondary" small disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, backgroundColor: C.bg, borderRadius: R.md, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: 14, color: C.text, outlineStyle: 'none' as any },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.lg, marginTop: SP.lg },
});

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IndianRupee } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, money, fmtDate, titleCase, hasPerm } from '../../src/ops/theme';
import { Card, Btn, Badge, DataTable, Spinner, PageHeader, Chips, Sheet, Field, TextField, Dropdown, EmptyState } from '../../src/ops/ui';
import { ExportButtons } from '../../src/ops/ExportButtons';
import { useAuth } from '../../src/context/AuthContext';

export default function Payouts() {
  const { user } = useAuth();
  const canPay = hasPerm(user, 'manage_payouts');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('');
  const [pay, setPay] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await opsApi.payouts({ period })); } catch {} finally { setLoading(false); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const openPay = (r: any) => { setForm({ amount: String(r.pending_payout > 0 ? r.pending_payout : r.net_payable), reference_number: '', notes: '', method: 'bank_transfer' }); setPay(r); };
  const submitPay = async () => {
    setSaving(true);
    try {
      await opsApi.markPaid({ vendor_id: pay.vendor_id, amount: Number(form.amount) || 0, reference_number: form.reference_number, notes: form.notes, method: form.method });
      setPay(null); await load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'vendor_name', label: 'Vendor', width: 170, render: (r: any) => <Text style={{ fontWeight: '700', fontSize: 14 }}>{r.vendor_name}</Text> },
    { key: 'total_sales', label: 'Total Sales', width: 110, render: (r: any) => <Text style={{ fontWeight: '600' }}>{money(r.total_sales)}</Text> },
    { key: 'commission', label: 'Commission', width: 110, render: (r: any) => <Text style={{ fontSize: 13 }}>{money(r.commission)}</Text> },
    { key: 'gst_on_commission', label: 'GST on Comm.', width: 110, render: (r: any) => <Text style={{ fontSize: 13 }}>{money(r.gst_on_commission)}</Text> },
    { key: 'net_payable', label: 'Net Payable', width: 110, render: (r: any) => <Text style={{ fontWeight: '700', color: C.primaryDark }}>{money(r.net_payable)}</Text> },
    { key: 'completed_orders', label: 'Completed', width: 90, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.completed_orders}</Text> },
    { key: 'pending_orders', label: 'Pending', width: 80, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.pending_orders}</Text> },
    { key: 'pending_payout', label: 'Pending Payout', width: 120, render: (r: any) => <Text style={{ fontWeight: '700', color: r.pending_payout > 0 ? C.warn : C.textSec }}>{money(r.pending_payout)}</Text> },
    { key: 'last_payout_date', label: 'Last Payout', width: 110, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{fmtDate(r.last_payout_date)}</Text> },
    { key: 'status', label: 'Status', width: 100, render: (r: any) => <Badge label={titleCase(r.status)} tone={r.status === 'paid' ? 'success' : r.status === 'pending' ? 'warn' : 'neutral'} /> },
    { key: 'actions', label: 'Action', width: 120, render: (r: any) => canPay ? <Btn title="Mark Paid" small icon={IndianRupee} onPress={() => openPay(r)} /> : <Text style={{ color: C.textMute }}>—</Text> },
  ];

  return (
    <View>
      <PageHeader title="Payouts" subtitle="Vendor settlements"
        right={<ExportButtons entity="payouts" />} />
      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <Text style={styles.flabel}>Period</Text>
        <Chips value={period} options={['', 'weekly', 'monthly']} onChange={setPeriod} />
      </Card>
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (rows.length ? <DataTable columns={columns} rows={rows} keyField="vendor_id" /> : <EmptyState title="No payout data" />)}
      </Card>

      <Sheet visible={!!pay} onClose={() => setPay(null)} title={`Mark Paid · ${pay?.vendor_name || ''}`}
        footer={<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SP.sm }}>
          <Btn title="Cancel" variant="secondary" small onPress={() => setPay(null)} />
          <Btn title="Record Payout" small onPress={submitPay} loading={saving} />
        </View>}>
        <Text style={{ color: C.textSec, marginBottom: SP.md }}>Net payable: <Text style={{ fontWeight: '700', color: C.text }}>{money(pay?.net_payable)}</Text> · Pending: <Text style={{ fontWeight: '700', color: C.warn }}>{money(pay?.pending_payout)}</Text></Text>
        <Field label="Amount (₹)" required><TextField value={form.amount} onChangeText={(v: string) => setForm((p: any) => ({ ...p, amount: v }))} keyboardType="numeric" /></Field>
        <Field label="Payout Method"><Dropdown value={form.method} onChange={(v) => setForm((p: any) => ({ ...p, method: v }))}
          options={[{ label: 'Bank Transfer', value: 'bank_transfer' }, { label: 'UPI', value: 'upi' }, { label: 'Razorpay', value: 'razorpay' }, { label: 'Cash', value: 'cash' }]} /></Field>
        <Field label="Reference Number"><TextField value={form.reference_number} onChangeText={(v: string) => setForm((p: any) => ({ ...p, reference_number: v }))} placeholder="UTR / transaction id" /></Field>
        <Field label="Notes"><TextField value={form.notes} onChangeText={(v: string) => setForm((p: any) => ({ ...p, notes: v }))} placeholder="Optional" multiline /></Field>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flabel: { fontSize: 11.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', marginBottom: 6 },
});

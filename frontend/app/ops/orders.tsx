import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, money, fmtDateTime, titleCase, hasPerm } from '../../src/ops/theme';
import { Card, Badge, DataTable, Spinner, PageHeader, Chips, Dropdown, EmptyState, Btn, ConfirmDialog, Sheet, Field, TextField } from '../../src/ops/ui';
import { ExportButtons } from '../../src/ops/ExportButtons';
import { useAuth } from '../../src/context/AuthContext';
import { FlaskConical, ScanLine, CheckCircle2, XCircle } from 'lucide-react-native';

const STATUS_TONE: any = { reserved: 'info', picked_up: 'success', cancelled: 'danger', refunded: 'warn', expired: 'warn' };

export default function Orders() {
  const { user } = useAuth();
  const canUpdate = hasPerm(user, 'update_order_status');
  const canRefund = hasPerm(user, 'manage_payouts');
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [refundRow, setRefundRow] = useState<any>(null);
  const [refunding, setRefunding] = useState(false);
  const isAdmin = user?.role === 'admin';
  const [testOpen, setTestOpen] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [testVendor, setTestVendor] = useState('');
  const [creatingTest, setCreatingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Pickup code verification
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const openVerify = () => { setVerifyCode(''); setVerifyResult(null); setVerifyOpen(true); };
  const doVerify = async () => {
    const code = verifyCode.trim();
    if (!code) { setVerifyResult({ valid: false, message: 'Please enter a pickup code.' }); return; }
    setVerifying(true);
    try {
      const res = await opsApi.verifyPickup(code);
      setVerifyResult(res);
      if (res?.valid) await load();
    } catch (e: any) {
      setVerifyResult({ valid: false, message: e.message || 'Could not verify this code.' });
    } finally { setVerifying(false); }
  };

  const openTest = async () => {
    setTestResult(null); setTestOpen(true);
    if (!vendors.length) {
      try { const r = await opsApi.listVendors({ page_size: 100 }); setVendors(r.items || []); } catch {}
    }
  };
  const createTest = async () => {
    setCreatingTest(true);
    try {
      const res = await opsApi.createTestOrder(testVendor || undefined);
      setTestResult(res);
      await load();
    } catch (e: any) { alert(e.message); } finally { setCreatingTest(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.listOrders({ range, status, page, page_size: 25 })); } catch {} finally { setLoading(false); }
  }, [range, status, page]);
  useEffect(() => { load(); }, [load]);

  const setStatusFor = async (id: string, s: string) => { await opsApi.orderStatus(id, s); await load(); };
  const doRefund = async () => {
    setRefunding(true);
    try { await opsApi.refundOrder(refundRow.order_id); setRefundRow(null); await load(); }
    catch (e: any) { alert(e.message); } finally { setRefunding(false); }
  };

  const columns = [
    { key: 'order_id', label: 'Order ID', width: 170, render: (r: any) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '600' }}>{r.order_id}</Text>
        {r.is_test ? <Badge label="TEST" tone="warn" /> : null}
      </View>
    ) },
    { key: 'customer_name', label: 'Customer', width: 130 },
    { key: 'vendor_name', label: 'Vendor', width: 150 },
    { key: 'food_item_name', label: 'Items', width: 160, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.quantity}× {r.food_item_name}</Text> },
    { key: 'order_value', label: 'Value', width: 90, render: (r: any) => <Text style={{ fontWeight: '700' }}>{money(r.order_value)}</Text> },
    { key: 'pickup_code', label: 'Pickup Code', width: 110, render: (r: any) => <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 1, color: r.pickup_code ? C.text : C.textMute }}>{r.pickup_code || '—'}</Text> },
    { key: 'created_at', label: 'Created', width: 140, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{fmtDateTime(r.created_at)}</Text> },
    { key: 'razorpay_payment_id', label: 'Payment', width: 90, render: (r: any) => <Badge label={r.razorpay_payment_id ? 'Paid' : 'Pending'} tone={r.razorpay_payment_id ? 'success' : 'warn'} /> },
    { key: 'status', label: 'Pickup Status', width: 150, render: (r: any) => (
      canUpdate ? (
        <View style={{ width: 140 }}>
          <Dropdown value={r.status} onChange={(s) => setStatusFor(r.order_id, s)}
            options={['reserved', 'picked_up', 'cancelled', 'refunded', 'expired'].map((s) => ({ label: titleCase(s), value: s }))} />
        </View>
      ) : <Badge label={titleCase(r.status)} tone={STATUS_TONE[r.status] || 'neutral'} />
    ) },
    { key: 'actions', label: 'Actions', width: 100, render: (r: any) => (
      canRefund && r.status !== 'refunded' && r.status !== 'cancelled'
        ? <Btn title="Refund" variant="secondary" small onPress={() => setRefundRow(r)} />
        : <Text style={{ color: C.textMute }}>—</Text>
    ) },
  ];

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / 25));

  return (
    <View>
      <PageHeader title="Orders" subtitle={`${data.total || 0} orders`} right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
          {canUpdate && <Btn title="Verify Pickup" variant="secondary" small icon={ScanLine} onPress={openVerify} />}
          {isAdmin && <Btn title="Test Order" variant="secondary" small icon={FlaskConical} onPress={openTest} />}
          <ExportButtons entity="orders" />
        </View>
      } />
      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <View style={{ flexDirection: 'row', gap: SP.lg, flexWrap: 'wrap', alignItems: 'center' }}>
          <View><Text style={styles.flabel}>Period</Text><Chips value={range} options={['', 'today', 'week']} onChange={(v) => { setRange(v); setPage(1); }} /></View>
          <View><Text style={styles.flabel}>Status</Text><Chips value={status} options={['', 'reserved', 'picked_up', 'cancelled', 'refunded']} onChange={(v) => { setStatus(v); setPage(1); }} /></View>
        </View>
      </Card>
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length ? <DataTable columns={columns} rows={data.items} keyField="order_id" /> : <EmptyState title="No orders found" />)}
      </Card>
      <ConfirmDialog visible={!!refundRow} title="Refund this order?" danger loading={refunding}
        message={`Mark order ${refundRow?.order_id || ''} as refunded and invalidate its pickup code? This does not auto-refund money in Razorpay — issue the refund there separately.`}
        confirmLabel="Mark Refunded" onConfirm={doRefund} onCancel={() => setRefundRow(null)} />

      <Sheet visible={testOpen} onClose={() => setTestOpen(false)} title="Create Test Order">
        {testResult ? (
          <View style={{ gap: SP.md }}>
            <Text style={{ color: C.textSec }}>A PAID test order was created for pickup testing.</Text>
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>PICKUP CODE</Text>
              <Text style={styles.codeValue}>{testResult.pickup_code}</Text>
            </View>
            <Text style={{ color: C.text }}>Vendor: <Text style={{ fontWeight: '700' }}>{testResult.vendor_name}</Text></Text>
            <Text style={{ color: C.textSec, fontSize: 12.5 }}>Order {testResult.order_id}</Text>
            <Text style={{ color: C.textSec, fontSize: 12.5 }}>Log in to that vendor's app → Orders → Ready for Pickup → Verify Pickup, then enter this code.</Text>
            <View style={{ flexDirection: 'row', gap: SP.md }}>
              <Btn title="Create Another" variant="secondary" onPress={() => setTestResult(null)} />
              <Btn title="Done" onPress={() => setTestOpen(false)} />
            </View>
          </View>
        ) : (
          <View style={{ gap: SP.md }}>
            <Field label="Vendor (optional — defaults to first active)">
              <Dropdown value={testVendor} onChange={setTestVendor} placeholder="First active vendor"
                options={[{ label: 'First active vendor', value: '' }, ...vendors.map((v: any) => ({ label: v.name, value: v.vendor_id }))]} />
            </Field>
            <Btn title="Create Test Order" icon={FlaskConical} loading={creatingTest} onPress={createTest} full />
          </View>
        )}
      </Sheet>

      <Sheet visible={verifyOpen} onClose={() => setVerifyOpen(false)} title="Verify Pickup Code">
        <View style={{ gap: SP.md }}>
          <Text style={{ color: C.textSec, fontSize: 13.5 }}>
            Enter the customer's 6-digit pickup code to confirm it. A valid, unclaimed order is
            marked as picked up automatically.
          </Text>
          <Field label="Pickup Code">
            <TextField
              value={verifyCode}
              onChangeText={(v: string) => { setVerifyCode(v.replace(/[^0-9]/g, '').slice(0, 6)); setVerifyResult(null); }}
              placeholder="e.g. 482915"
              keyboardType="number-pad"
            />
          </Field>
          <Btn title="Verify Code" icon={ScanLine} loading={verifying} onPress={doVerify} full disabled={!verifyCode.trim()} />

          {verifyResult ? (
            <View style={[styles.verifyResult, { borderColor: verifyResult.valid ? C.success : C.danger, backgroundColor: (verifyResult.valid ? C.success : C.danger) + '10' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginBottom: verifyResult.order_id ? SP.sm : 0 }}>
                {verifyResult.valid ? <CheckCircle2 size={20} color={C.success} /> : <XCircle size={20} color={C.danger} />}
                <Text style={{ flex: 1, fontWeight: '700', color: verifyResult.valid ? C.success : C.danger }}>{verifyResult.message}</Text>
              </View>
              {verifyResult.order_id ? (
                <View style={{ gap: 4 }}>
                  <VRow label="Order" value={verifyResult.order_id} />
                  <VRow label="Customer" value={verifyResult.customer_name} />
                  <VRow label="Vendor" value={verifyResult.vendor_name} />
                  <VRow label="Item" value={`${verifyResult.quantity}× ${verifyResult.food_item_name}`} />
                  <VRow label="Value" value={money(verifyResult.order_value)} />
                  <VRow label="Status" value={titleCase(verifyResult.status)} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Sheet>

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
  flabel: { fontSize: 11.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', marginBottom: 6 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.lg, marginTop: SP.lg },
  codeCard: { backgroundColor: C.primary, borderRadius: 14, padding: SP.lg, alignItems: 'center' },
  codeLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  codeValue: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: 8, marginTop: 4 },
  verifyResult: { borderWidth: 1, borderRadius: 12, padding: SP.md, marginTop: SP.sm },
  vrow: { flexDirection: 'row', justifyContent: 'space-between', gap: SP.md },
  vrowLabel: { fontSize: 12.5, color: C.textSec },
  vrowValue: { fontSize: 13, fontWeight: '600', color: C.text, flexShrink: 1, textAlign: 'right' },
});

function VRow({ label, value }: { label: string; value?: any }) {
  return (
    <View style={styles.vrow}>
      <Text style={styles.vrowLabel}>{label}</Text>
      <Text style={styles.vrowValue}>{value || '—'}</Text>
    </View>
  );
}

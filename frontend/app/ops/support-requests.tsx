import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, money, fmtDateTime } from '../../src/ops/theme';
import { Card, Badge, DataTable, Spinner, PageHeader, Chips, Dropdown, EmptyState, Btn, Sheet } from '../../src/ops/ui';
import { SUPPORT_ISSUE_TYPES } from '../../src/constants/support';

const LABELS: Record<string, string> = Object.fromEntries(SUPPORT_ISSUE_TYPES.map((t) => [t.key, t.label]));

export default function SupportRequests() {
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [issueType, setIssueType] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.supportRequests({ issue_type: issueType, status, page_size: 100 })); }
    catch {} finally { setLoading(false); }
  }, [issueType, status]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetail({ loading: true }); setDetailLoading(true);
    try { setDetail(await opsApi.supportDetail(id)); }
    catch (e: any) { alert(e.message); setDetail(null); }
    finally { setDetailLoading(false); }
  };
  const doResolve = async () => {
    setActing(true);
    try { await opsApi.resolveSupport(detail.support_id); setDetail({ ...detail, status: 'resolved' }); await load(); }
    catch (e: any) { alert(e.message); } finally { setActing(false); }
  };
  const doEnableWhatsapp = async () => {
    setActing(true);
    try { await opsApi.enableSupportWhatsapp(detail.support_id); setDetail({ ...detail, whatsapp_enabled: true }); await load(); }
    catch (e: any) { alert(e.message); } finally { setActing(false); }
  };

  const columns = [
    { key: 'customer_name', label: 'Customer', width: 150 },
    { key: 'issue_type', label: 'Issue Type', width: 150, render: (r: any) => <Text style={{ fontSize: 13 }}>{LABELS[r.issue_type] || r.issue_type}</Text> },
    { key: 'order_id', label: 'Order ID', width: 150, render: (r: any) => <Text style={{ fontSize: 12.5 }}>{r.order_id || '—'}</Text> },
    { key: 'restaurant_name', label: 'Restaurant', width: 150, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.restaurant_name || '—'}</Text> },
    { key: 'created_at', label: 'Submitted', width: 150, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{fmtDateTime(r.created_at)}</Text> },
    { key: 'status', label: 'Status', width: 110, render: (r: any) => <Badge label={r.status === 'resolved' ? 'Resolved' : 'Open'} tone={r.status === 'resolved' ? 'success' : 'info'} /> },
    { key: 'actions', label: 'Actions', width: 90, render: (r: any) => <Btn title="View" variant="secondary" small onPress={() => openDetail(r.support_id)} /> },
  ];

  const d = detail && !detail.loading ? detail : null;

  return (
    <View>
      <PageHeader title="Support Requests" subtitle={`${data.total || 0} tickets`} />
      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <View style={{ flexDirection: 'row', gap: SP.lg, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <View style={{ minWidth: 200 }}>
            <Text style={styles.flabel}>Issue Type</Text>
            <Dropdown value={issueType} onChange={setIssueType} placeholder="All issues"
              options={[{ label: 'All Issues', value: '' }, ...SUPPORT_ISSUE_TYPES.map((t) => ({ label: t.label, value: t.key }))]} />
          </View>
          <View>
            <Text style={styles.flabel}>Status</Text>
            <Chips value={status} options={['', 'open', 'resolved']} onChange={setStatus} />
          </View>
        </View>
      </Card>
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length ? <DataTable columns={columns} rows={data.items} keyField="support_id" /> : <EmptyState title="No support requests" subtitle="Customer tickets will appear here." />)}
      </Card>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={d ? (LABELS[d.issue_type] || 'Support Request') : 'Support Request'} wide>
        {detailLoading || !d ? <Spinner /> : (
          <View style={{ gap: SP.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
              <Badge label={d.status === 'resolved' ? 'Resolved' : 'Open'} tone={d.status === 'resolved' ? 'success' : 'info'} />
              {d.whatsapp_enabled ? <Badge label="WhatsApp Enabled" tone="success" /> : null}
            </View>

            <Row label="Customer Name" value={d.customer_name} />
            <Row label="Phone Number" value={d.phone} />
            <Row label="Issue Type" value={LABELS[d.issue_type] || d.issue_type} />
            <Row label="Order ID" value={d.order?.order_id} />
            <Row label="Restaurant" value={d.order?.restaurant_name} />
            <Row label="Order Amount" value={d.order?.order_amount != null ? money(d.order.order_amount) : null} />
            <Row label="Pickup Date & Time" value={[d.order?.pickup_start_time, d.order?.pickup_end_time].filter(Boolean).join(' - ')} />
            <Row label="Description / Reason" value={d.message} />
            {d.issue_type === 'app_bug' ? <>
              <Row label="Device Model" value={d.device_model} />
              <Row label="App Version" value={d.app_version} />
              <Row label="What happened" value={d.what_happened} />
            </> : null}
            <Row label="Submitted" value={fmtDateTime(d.created_at)} />
            {d.whatsapp_enabled_by ? <Row label="WhatsApp enabled by" value={`${d.whatsapp_enabled_by} · ${fmtDateTime(d.whatsapp_enabled_at)}`} /> : null}
            {d.resolved_by ? <Row label="Resolved by" value={`${d.resolved_by} · ${fmtDateTime(d.resolved_at)}`} /> : null}

            {d.photo_base64 ? (
              <View>
                <Text style={styles.flabel}>Uploaded Photo</Text>
                <Image source={{ uri: d.photo_base64 }} style={styles.photo} resizeMode="cover" />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: SP.md, marginTop: SP.sm, flexWrap: 'wrap' }}>
              <Btn title={d.status === 'resolved' ? 'Resolved' : 'Mark as Resolved'} onPress={doResolve} loading={acting} disabled={d.status === 'resolved'} />
              <Btn title={d.whatsapp_enabled ? 'WhatsApp Enabled' : 'Enable WhatsApp Support'} variant="secondary" onPress={doEnableWhatsapp} loading={acting} disabled={d.whatsapp_enabled} />
            </View>
          </View>
        )}
      </Sheet>
    </View>
  );
}

function Row({ label, value }: { label: string; value?: any }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flabel: { fontSize: 11.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SP.lg, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 8 },
  rowLabel: { fontSize: 13, color: C.textSec, flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '600', color: C.text, flex: 1.4, textAlign: 'right' },
  photo: { width: '100%', height: 260, borderRadius: 10, backgroundColor: C.surfaceAlt },
});

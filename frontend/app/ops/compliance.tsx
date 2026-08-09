import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, Platform, TextInput, Pressable } from 'react-native';
import { FileText, ExternalLink } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, titleCase, fmtDateTime } from '../../src/ops/theme';
import { Card, Badge, DataTable, Spinner, PageHeader, Chips, EmptyState, Btn, Sheet, ConfirmDialog } from '../../src/ops/ui';
import { useAuth } from '../../src/context/AuthContext';

const STATUS_TONE: any = {
  pending_verification: 'warn', active: 'success', rejected: 'danger',
  suspended: 'danger', draft: 'neutral',
};
const STATUS_LABEL: any = {
  pending_verification: 'Pending Verification', active: 'Active', rejected: 'Rejected',
  suspended: 'Suspended', draft: 'Draft',
};

export default function Compliance() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [status, setStatus] = useState('pending_verification');
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [rejectFor, setRejectFor] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [suspendFor, setSuspendFor] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.complianceList(status)); } catch {} finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetail({ loading: true }); setDetailLoading(true);
    try { setDetail(await opsApi.complianceDetail(id)); }
    catch (e: any) { alert(e.message); setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const doApprove = async () => {
    setActing(true);
    try { await opsApi.approveVendor(detail.vendor_id); setDetail(null); await load(); }
    catch (e: any) { alert(e.message); } finally { setActing(false); }
  };
  const doReject = async () => {
    if (!reason.trim()) { alert('Please enter a rejection reason.'); return; }
    setActing(true);
    try { await opsApi.rejectVendor((rejectFor || detail).vendor_id, reason.trim()); setRejectFor(null); setReason(''); setDetail(null); await load(); }
    catch (e: any) { alert(e.message); } finally { setActing(false); }
  };
  const doSuspend = async () => {
    setActing(true);
    try { await opsApi.suspendVendor((suspendFor || detail).vendor_id, reason.trim()); setSuspendFor(null); setReason(''); setDetail(null); await load(); }
    catch (e: any) { alert(e.message); } finally { setActing(false); }
  };

  const columns = [
    { key: 'name', label: 'Vendor', width: 200, render: (r: any) => (
      <Pressable onPress={() => openDetail(r.vendor_id)}>
        <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>{r.name}</Text>
        <Text style={{ color: C.textMute, fontSize: 12 }}>{r.email}</Text>
      </Pressable>
    ) },
    { key: 'business_name', label: 'Business', width: 180, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.business_name || '—'}</Text> },
    { key: 'fssai_number', label: 'FSSAI', width: 140, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.fssai_number || '—'}</Text> },
    { key: 'gst_status', label: 'GST', width: 110, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.gst_status ? titleCase(r.gst_status) : '—'}</Text> },
    { key: 'submitted_at', label: 'Submitted', width: 150, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{r.submitted_at ? fmtDateTime(r.submitted_at) : '—'}</Text> },
    { key: 'status', label: 'Status', width: 150, render: (r: any) => <Badge label={STATUS_LABEL[r.status] || r.status} tone={STATUS_TONE[r.status] || 'neutral'} /> },
    { key: 'actions', label: '', width: 90, render: (r: any) => <Btn title="Review" variant="secondary" small onPress={() => openDetail(r.vendor_id)} /> },
  ];

  const d = detail && !detail.loading ? detail : null;
  const v = d?.verification || {};

  return (
    <View>
      <PageHeader title="Vendor Compliance" subtitle="Review and approve vendor verification" />
      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <Text style={styles.flabel}>Status</Text>
        <Chips value={status} options={['pending_verification', 'active', 'rejected', 'suspended', 'draft', '']}
          onChange={setStatus} />
      </Card>
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length ? <DataTable columns={columns} rows={data.items} keyField="vendor_id" /> : <EmptyState title="No vendors" subtitle="Nothing to review for this status." />)}
      </Card>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={d ? `${d.name}` : 'Vendor'} wide>
        {detailLoading || !d ? <Spinner /> : (
          <View style={{ gap: SP.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
              <Badge label={STATUS_LABEL[d.status] || d.status} tone={STATUS_TONE[d.status] || 'neutral'} />
              {d.submitted_at ? <Text style={{ color: C.textMute, fontSize: 12.5 }}>Submitted {fmtDateTime(d.submitted_at)}</Text> : null}
            </View>
            {d.status === 'rejected' && !!d.rejection_reason && (
              <View style={styles.reasonBox}><Text style={{ color: C.danger, fontWeight: '700', fontSize: 12.5 }}>Rejection reason</Text><Text style={{ color: C.text, fontSize: 13 }}>{d.rejection_reason}</Text></View>
            )}

            <Group title="Business Details">
              <Row label="Business Name" value={v.business_name} />
              <Row label="Authorised Representative" value={v.authorised_representative} />
              <Row label="Business Email" value={v.business_email} />
            </Group>

            <Group title="GST">
              <Row label="GST Status" value={v.gst_status ? titleCase(v.gst_status) : '—'} />
              {v.gst_status === 'registered' && <>
                <Row label="GST Number" value={v.gst_number} />
                <DocView label="GST Certificate" doc={v.gst_certificate} />
              </>}
            </Group>

            <Group title="FSSAI">
              <Row label="Licence Number" value={v.fssai_number} />
              <DocView label="FSSAI Certificate" doc={v.fssai_certificate} />
            </Group>

            <Group title="Bank Details">
              <Row label="Account Holder" value={v.bank_account_holder} />
              <Row label="Account Number" value={v.bank_account_number} />
              <Row label="IFSC" value={v.bank_ifsc} />
              <Row label="Bank Name" value={v.bank_name} />
            </Group>

            <Group title="Agreement & Signature">
              <Row label="Agreement Version" value={v.agreement?.version} />
              <Row label="Accepted" value={v.agreement?.accepted ? 'Yes' : 'No'} />
              <Row label="Accepted At" value={v.agreement?.accepted_at ? fmtDateTime(v.agreement.accepted_at) : '—'} />
              <Row label="Signed By" value={v.agreement?.signature_full_name} />
              <Row label="Designation" value={v.agreement?.signature_designation} />
            </Group>

            {isAdmin ? (
              <View style={{ flexDirection: 'row', gap: SP.sm, flexWrap: 'wrap', marginTop: SP.sm }}>
                {d.status !== 'active' && <Btn title="Approve & Activate" onPress={doApprove} loading={acting} />}
                {d.status !== 'rejected' && <Btn title="Reject" variant="danger" onPress={() => { setReason(''); setRejectFor(d); }} />}
                {d.status !== 'suspended' && <Btn title="Suspend" variant="secondary" onPress={() => { setReason(''); setSuspendFor(d); }} />}
              </View>
            ) : (
              <Text style={{ color: C.textMute, fontSize: 12.5, marginTop: SP.sm }}>Only an admin can approve, reject or suspend vendors.</Text>
            )}
          </View>
        )}
      </Sheet>

      {/* Reject with reason */}
      <Sheet visible={!!rejectFor} onClose={() => setRejectFor(null)} title="Reject Vendor"
        footer={<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SP.sm }}>
          <Btn title="Cancel" variant="secondary" small onPress={() => setRejectFor(null)} />
          <Btn title="Reject" variant="danger" small loading={acting} onPress={doReject} />
        </View>}>
        <Text style={{ color: C.textSec, marginBottom: SP.sm, fontSize: 13 }}>Tell the vendor what needs fixing. They can update and resubmit.</Text>
        <TextInput value={reason} onChangeText={setReason} placeholder="Reason for rejection…" placeholderTextColor={C.textMute} multiline style={styles.reasonInput} />
      </Sheet>

      <ConfirmDialog visible={!!suspendFor} title="Suspend vendor?" danger loading={acting}
        message={`Suspend "${suspendFor?.name}"? They will be hidden from customers and cannot receive orders.`}
        confirmLabel="Suspend" onConfirm={doSuspend} onCancel={() => setSuspendFor(null)} />
    </View>
  );
}

function openDoc(doc: any) {
  const uri = `data:${doc.mime || 'application/octet-stream'};base64,${doc.data}`;
  if (Platform.OS === 'web') {
    try {
      const byteStr = atob(doc.data);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: doc.mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch { window.open(uri, '_blank'); }
  } else {
    alert('This document is best viewed on the web dashboard.');
  }
}

function DocView({ label, doc }: any) {
  const isImage = doc?.mime?.startsWith('image/');
  return (
    <View style={{ marginBottom: SP.sm }}>
      <Text style={styles.docLabel}>{label}</Text>
      {!doc?.data ? <Text style={{ color: C.textMute, fontSize: 13 }}>Not uploaded</Text> : isImage ? (
        <Pressable onPress={() => openDoc(doc)}>
          <Image source={{ uri: `data:${doc.mime};base64,${doc.data}` }} style={styles.docImg} resizeMode="cover" />
        </Pressable>
      ) : (
        <Pressable style={styles.docPdf} onPress={() => openDoc(doc)}>
          <FileText size={18} color={C.primary} />
          <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13, flex: 1 }} numberOfLines={1}>{doc.name || 'Document.pdf'}</Text>
          <ExternalLink size={15} color={C.primary} />
        </Pressable>
      )}
    </View>
  );
}
function Group({ title, children }: any) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, value }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flabel: { fontSize: 11.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', marginBottom: 6 },
  group: { borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: SP.md },
  groupTitle: { fontSize: 13.5, fontWeight: '800', color: C.text, marginBottom: SP.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SP.md, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 12.5, color: C.textSec, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1.4, textAlign: 'right' },
  docLabel: { fontSize: 12, fontWeight: '700', color: C.textSec, marginBottom: 6 },
  docImg: { width: '100%', height: 220, borderRadius: R.md, backgroundColor: C.surfaceAlt },
  docPdf: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: SP.md, backgroundColor: C.bg },
  reasonBox: { backgroundColor: C.danger + '10', borderRadius: R.md, padding: SP.md },
  reasonInput: { minHeight: 90, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: SP.md, color: C.text, textAlignVertical: 'top', outlineStyle: 'none' as any },
});

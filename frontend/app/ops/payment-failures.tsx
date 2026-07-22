import React, { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, money, fmtDateTime } from '../../src/ops/theme';
import { Card, Badge, DataTable, Spinner, PageHeader, EmptyState } from '../../src/ops/ui';

export default function PaymentFailures() {
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.paymentFailures({ page_size: 100 })); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'created_at', label: 'When', width: 160, render: (r: any) => <Text style={{ fontSize: 13 }}>{fmtDateTime(r.created_at)}</Text> },
    { key: 'amount', label: 'Amount', width: 100, render: (r: any) => <Text style={{ fontWeight: '700' }}>{money(r.amount)}</Text> },
    { key: 'error_description', label: 'Reason', width: 240, render: (r: any) => <Text style={{ fontSize: 13, color: C.textSec }} numberOfLines={2}>{r.error_description || '—'}</Text> },
    { key: 'error_code', label: 'Code', width: 130, render: (r: any) => r.error_code ? <Badge label={r.error_code} tone="danger" /> : <Text style={{ color: C.textMute }}>—</Text> },
    { key: 'method', label: 'Method', width: 100, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.method || '—'}</Text> },
    { key: 'razorpay_payment_id', label: 'Payment ID', width: 170, render: (r: any) => <Text style={{ fontSize: 12, color: C.textMute }} numberOfLines={1}>{r.razorpay_payment_id || '—'}</Text> },
    { key: 'razorpay_order_id', label: 'Order ID', width: 170, render: (r: any) => <Text style={{ fontSize: 12, color: C.textMute }} numberOfLines={1}>{r.razorpay_order_id || '—'}</Text> },
  ];

  return (
    <View>
      <PageHeader title="Failed Payments" subtitle={`${data.total || 0} logged`} />
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length
          ? <DataTable columns={columns} rows={data.items} keyField="razorpay_payment_id" />
          : <EmptyState title="No failed payments" subtitle="Failed Razorpay payments captured by the webhook will appear here." />)}
      </Card>
    </View>
  );
}

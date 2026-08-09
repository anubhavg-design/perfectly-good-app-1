import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetch, getToken } from './client';

const API = (() => {
  const u = process.env.EXPO_PUBLIC_BACKEND_URL;
  return u ? `${u.replace(/\/$/, '')}/api` : '/api';
})();

async function postFile(path: string, uri: string, name: string) {
  const token = await getToken();
  const fname = name || 'upload';
  const lower = fname.toLowerCase();
  const type = lower.endsWith('.csv') ? 'text/csv'
    : lower.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : lower.endsWith('.xls') ? 'application/vnd.ms-excel'
    : 'application/octet-stream';
  const fd = new FormData();
  if (Platform.OS === 'web') {
    // On web the picker gives a blob:/data: URI we can fetch into a Blob
    const blob = await (await fetch(uri)).blob();
    fd.append('file', blob as any, fname);
  } else {
    // On native, append the file descriptor directly (fetching file:// into a
    // blob fails with "Network request failed"). Let fetch build the multipart boundary.
    fd.append('file', { uri, name: fname, type } as any);
  }
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Upload failed');
  return data;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function downloadExport(entity: string, format: 'csv' | 'xlsx') {
  const token = await getToken();
  const res = await fetch(`${API}/ops/export/${entity}?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const filename = `${entity}.${format}`;
  const mime = format === 'csv'
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // Native (Expo Go / built app): write to cache then open the share/save sheet.
  const base64 = await blobToBase64(blob);
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: mime,
    dialogTitle: `Export ${entity}`,
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'org.openxmlformats.spreadsheetml.sheet',
  });
}

const qs = (o: Record<string, any> = {}) => {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const opsApi = {
  stats: (range?: string) => apiFetch(`/ops/dashboard/stats${range ? `?range=${encodeURIComponent(range)}` : ''}`),

  listVendors: (p?: any) => apiFetch(`/ops/vendors${qs(p)}`),
  createVendor: (b: any) => apiFetch('/ops/vendors', { method: 'POST', body: JSON.stringify(b) }),
  vendor: (id: string) => apiFetch(`/ops/vendors/${id}`),
  updateVendor: (id: string, b: any) => apiFetch(`/ops/vendors/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  vendorStatus: (id: string, status: string) => apiFetch(`/ops/vendors/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  deleteVendor: (id: string) => apiFetch(`/ops/vendors/${id}`, { method: 'DELETE' }),
  assignableOps: () => apiFetch('/ops/assignable-ops'),
  addNote: (id: string, note: string) => apiFetch(`/ops/vendors/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),

  vendorMenu: (id: string) => apiFetch(`/ops/vendors/${id}/menu`),
  addMenuItem: (id: string, b: any) => apiFetch(`/ops/vendors/${id}/menu`, { method: 'POST', body: JSON.stringify(b) }),
  updateMenuItem: (mid: string, b: any) => apiFetch(`/ops/menu/${mid}`, { method: 'PUT', body: JSON.stringify(b) }),
  duplicateItem: (mid: string) => apiFetch(`/ops/menu/${mid}/duplicate`, { method: 'POST' }),
  deleteItem: (mid: string) => apiFetch(`/ops/menu/${mid}`, { method: 'DELETE' }),
  toggleItem: (mid: string, available_today: boolean) =>
    apiFetch(`/ops/menu/${mid}/availability`, { method: 'PUT', body: JSON.stringify({ available_today }) }),

  listOrders: (p?: any) => apiFetch(`/ops/orders${qs(p)}`),
  orderStatus: (id: string, status: string) => apiFetch(`/ops/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  refundOrder: (id: string) => apiFetch(`/ops/orders/${id}/refund`, { method: 'POST' }),
  createTestOrder: (vendor_id?: string) => apiFetch('/ops/orders/test', { method: 'POST', body: JSON.stringify({ vendor_id: vendor_id || null }) }),
  verifyPickup: (code: string) => apiFetch('/ops/orders/verify-pickup', { method: 'POST', body: JSON.stringify({ code }) }),
  supportRequests: (p?: any) => apiFetch(`/ops/support-requests${qs(p)}`),
  supportOpenCount: () => apiFetch('/ops/support-open-count'),
  supportDetail: (id: string) => apiFetch(`/ops/support-requests/${id}`),
  resolveSupport: (id: string) => apiFetch(`/ops/support-requests/${id}/resolve`, { method: 'PUT' }),
  enableSupportWhatsapp: (id: string) => apiFetch(`/ops/support-requests/${id}/whatsapp`, { method: 'PUT' }),

  listUsers: (p?: any) => apiFetch(`/ops/users${qs(p)}`),

  payouts: (p?: any) => apiFetch(`/ops/payouts${qs(p)}`),
  paymentFailures: (p?: any) => apiFetch(`/ops/payment-failures${qs(p)}`),
  payoutHistory: (id: string) => apiFetch(`/ops/payouts/${id}/history`),
  markPaid: (b: any) => apiFetch('/ops/payouts/mark-paid', { method: 'POST', body: JSON.stringify(b) }),

  settings: () => apiFetch('/ops/settings'),
  updateSettings: (b: any) => apiFetch('/ops/settings', { method: 'PUT', body: JSON.stringify(b) }),

  roles: () => apiFetch('/ops/roles'),
  staff: () => apiFetch('/ops/staff'),
  createStaff: (b: any) => apiFetch('/ops/staff', { method: 'POST', body: JSON.stringify(b) }),
  updateStaffRole: (id: string, b: any) => apiFetch(`/ops/staff/${id}/role`, { method: 'PUT', body: JSON.stringify(b) }),
  setStaffPassword: (id: string, password: string) => apiFetch(`/ops/staff/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  deleteStaff: (id: string) => apiFetch(`/ops/staff/${id}`, { method: 'DELETE' }),

  search: (q: string) => apiFetch(`/ops/search?q=${encodeURIComponent(q)}`),

  analytics: (days = 30) => apiFetch(`/ops/analytics?days=${days}`),
  vendorPerformance: (id: string) => apiFetch(`/ops/vendors/${id}/performance`),
  parseMenuFile: (uri: string, name: string) => postFile('/ops/menu-import/parse-file', uri, name),
  bulkAddMenu: (id: string, items: any[]) => apiFetch(`/ops/vendors/${id}/menu/bulk`, { method: 'POST', body: JSON.stringify({ items }) }),
  bulkUploadImages: (id: string, uri: string, name: string) => postFile(`/ops/vendors/${id}/bulk-images`, uri, name),
};

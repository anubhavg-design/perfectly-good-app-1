import { Platform } from 'react-native';
import { apiFetch, getToken } from './client';

const API = (() => {
  const u = process.env.EXPO_PUBLIC_BACKEND_URL;
  return u ? `${u.replace(/\/$/, '')}/api` : '/api';
})();

async function postFile(path: string, uri: string, name: string) {
  const token = await getToken();
  const blob = await (await fetch(uri)).blob();
  const fd = new FormData();
  fd.append('file', blob as any, name || 'upload');
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Upload failed');
  return data;
}

export async function downloadExport(entity: string, format: 'csv' | 'xlsx') {
  const token = await getToken();
  const res = await fetch(`${API}/ops/export/${entity}?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${entity}.${format}`; a.click();
    URL.revokeObjectURL(url);
  } else {
    throw new Error('Exports download from the web dashboard.');
  }
}

const qs = (o: Record<string, any> = {}) => {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const opsApi = {
  stats: () => apiFetch('/ops/dashboard/stats'),

  listVendors: (p?: any) => apiFetch(`/ops/vendors${qs(p)}`),
  createVendor: (b: any) => apiFetch('/ops/vendors', { method: 'POST', body: JSON.stringify(b) }),
  vendor: (id: string) => apiFetch(`/ops/vendors/${id}`),
  updateVendor: (id: string, b: any) => apiFetch(`/ops/vendors/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  vendorStatus: (id: string, status: string) => apiFetch(`/ops/vendors/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  deleteVendor: (id: string) => apiFetch(`/ops/vendors/${id}`, { method: 'DELETE' }),
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

  listUsers: (p?: any) => apiFetch(`/ops/users${qs(p)}`),

  payouts: (p?: any) => apiFetch(`/ops/payouts${qs(p)}`),
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
  extractMenu: (uri: string, name: string) => postFile('/ops/menu-import/extract', uri, name),
  parseMenuFile: (uri: string, name: string) => postFile('/ops/menu-import/parse-file', uri, name),
  bulkAddMenu: (id: string, items: any[]) => apiFetch(`/ops/vendors/${id}/menu/bulk`, { method: 'POST', body: JSON.stringify({ items }) }),
};

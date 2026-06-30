import { apiFetch } from './client';

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
  deleteStaff: (id: string) => apiFetch(`/ops/staff/${id}`, { method: 'DELETE' }),

  search: (q: string) => apiFetch(`/ops/search?q=${encodeURIComponent(q)}`),
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function resolveApiBase(): string {
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  const envBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;

  // Explicit full API URL takes highest priority
  if (envApiUrl) return envApiUrl;

  // Backend URL with /api suffix
  if (envBackendUrl) return `${envBackendUrl}/api`;

  // Try reading from Expo config extra (set via app.config.js)
  const configBackendUrl = Constants.expoConfig?.extra?.backendUrl;
  if (configBackendUrl) return `${configBackendUrl}/api`;

  // On web, relative path works (same origin)
  if (Platform.OS === 'web') return '/api';

  // Native fallback: try to extract from Expo host URI
  const hostUri = Constants.experienceUrl;
  if (hostUri) {
    try {
      const url = new URL(hostUri);
      return `${url.protocol}//${url.host}/api`;
    } catch {}
  }

  // Last resort fallback for native - use /api (will show "Invalid URL" error)
  return '/api';
}

const API_BASE = resolveApiBase();

let accessToken: string | null = null;

export async function loadToken() {
  accessToken = await AsyncStorage.getItem('access_token');
}

export async function setToken(token: string | null) {
  accessToken = token;
  if (token) {
    await AsyncStorage.setItem('access_token', token);
  } else {
    await AsyncStorage.removeItem('access_token');
  }
}

export async function getToken() {
  if (!accessToken) {
    accessToken = await AsyncStorage.getItem('access_token');
  }
  return accessToken;
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch(path: string, options: FetchOptions = {}) {
  const { skipAuth, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> || {}),
  };

  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    let message = errorBody.detail || errorBody.message || '';
    // Handle FastAPI 422 validation errors (array of objects)
    if (Array.isArray(message)) {
      message = message.map((e: any) => e.msg || JSON.stringify(e)).join('. ');
    }
    if (!message) {
      if (response.status === 404) {
        message = 'Server is currently unavailable. Please try again later.';
      } else if (response.status === 401) {
        message = 'Invalid credentials or session expired.';
      } else if (response.status === 502 || response.status === 503) {
        message = 'Server is waking up. Please try again in a moment.';
      } else {
        message = `Something went wrong (${response.status})`;
      }
    }
    throw new ApiError(response.status, message);
  }

  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Auth endpoints
export const authApi = {
  register: async (data: { name: string; email: string; phone: string; password: string }) => {
    const res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data), skipAuth: true });
    if (res?.access_token) {
      await setToken(res.access_token);
    }
    return res;
  },

  login: async (data: { email: string; password: string }) => {
    const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data), skipAuth: true });
    if (res?.access_token) {
      await setToken(res.access_token);
    }
    return res;
  },

  apple: async (data: { identity_token: string; name?: string; email?: string }) => {
    const res = await apiFetch('/auth/apple', { method: 'POST', body: JSON.stringify(data), skipAuth: true });
    if (res?.access_token) {
      await setToken(res.access_token);
    }
    return res;
  },

  me: () => apiFetch('/auth/me'),

  logout: async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    await setToken(null);
  },

  forgotPassword: (email: string) =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }), skipAuth: true }),

  resetPassword: (token: string, new_password: string) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }), skipAuth: true }),
};

// Help & Support endpoints
export const supportApi = {
  context: () => apiFetch('/support/context'),
  submit: (data: {
    issue_type: string; message?: string; photo_base64?: string | null;
    device_model?: string; app_version?: string; what_happened?: string;
  }) => apiFetch('/support/requests', { method: 'POST', body: JSON.stringify(data) }),
  myRequests: () => apiFetch('/support/my-requests'),
};

// Account deletion (Apple 5.1.1(v))
export const accountApi = {
  deleteAccount: () => apiFetch('/auth/me', { method: 'DELETE' }),
};

// Drops endpoints
export const dropsApi = {
  list: (params: { lat?: number; lon?: number; search?: string; category?: string; max_price?: number; sort_by?: string }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return apiFetch(`/drops?${query.toString()}`);
  },

  get: (itemId: string, lat?: number, lon?: number) => {
    const query = new URLSearchParams();
    if (lat) query.append('lat', String(lat));
    if (lon) query.append('lon', String(lon));
    return apiFetch(`/drops/${itemId}?${query.toString()}`);
  },

  categories: () => apiFetch('/drops/categories'),
};

// Deal alerts opt-in ("notify me when deals go live")
export const dealAlertsApi = {
  optIn: (area?: string) => apiFetch('/deal-alerts', { method: 'POST', body: JSON.stringify({ area }) }),
};

// Restaurants endpoints (surplus + takeaway + dine-in)
export const restaurantsApi = {
  list: (params: { lat?: number; lon?: number; search?: string; category?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const qs = query.toString();
    return apiFetch(`/restaurants${qs ? `?${qs}` : ''}`);
  },

  get: (vendorId: string) => apiFetch(`/restaurants/${vendorId}`),

  featuredDeals: (params: { lat?: number; lon?: number }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const qs = query.toString();
    return apiFetch(`/featured-deals${qs ? `?${qs}` : ''}`);
  },

  browseDeals: (params: { lat?: number; lon?: number; sort_by?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const qs = query.toString();
    return apiFetch(`/browse-deals${qs ? `?${qs}` : ''}`);
  },
};

// Orders endpoints
export const ordersApi = {
  create: (data: { food_item_id?: string; quantity?: number; items?: { food_item_id: string; quantity: number }[]; order_type?: string; shift_start?: string; shift_end?: string }) =>
    apiFetch('/orders/create', { method: 'POST', body: JSON.stringify(data) }),

  verify: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; food_item_id?: string; quantity?: number; order_type?: string }) =>
    apiFetch('/orders/verify', { method: 'POST', body: JSON.stringify(data) }),

  userOrders: () => apiFetch('/orders/user'),

  cancelOrder: (orderId: string) =>
    apiFetch(`/orders/${orderId}/cancel`, { method: 'PUT' }),

  reorder: (orderId: string) => apiFetch(`/orders/${orderId}/reorder`),
};

// Vendor endpoints
export const vendorApi = {
  drops: () => apiFetch('/vendor/drops'),

  getVerification: () => apiFetch('/vendor/verification'),
  saveVerification: (data: any) => apiFetch('/vendor/verification', { method: 'PUT', body: JSON.stringify(data) }),
  submitVerification: (data: any) => apiFetch('/vendor/verification/submit', { method: 'POST', body: JSON.stringify(data) }),
  getAgreement: () => apiFetch('/vendor/agreement'),
  changePassword: (current_password: string, new_password: string) =>
    apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
  listStaff: () => apiFetch('/vendor/staff'),
  createStaff: (data: any) => apiFetch('/vendor/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id: string, data: any) => apiFetch(`/vendor/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStaff: (id: string) => apiFetch(`/vendor/staff/${id}`, { method: 'DELETE' }),

  toggleDrop: (id: string, data: { is_active: boolean }) =>
    apiFetch(`/vendor/drops/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  orders: () => apiFetch('/vendor/orders'),

  updateOrderStatus: (orderId: string, status: string) =>
    apiFetch(`/vendor/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  verifyPickup: (orderId: string, code: string) =>
    apiFetch(`/vendor/orders/${orderId}/verify-pickup`, { method: 'PUT', body: JSON.stringify({ code }) }),

  menu: () => apiFetch('/vendor/menu'),

  toggleMenuItem: (id: string, in_stock: boolean) =>
    apiFetch(`/vendor/menu/${id}/toggle`, { method: 'PUT', body: JSON.stringify({ in_stock }) }),

  editMenuItem: (id: string, data: { image_url?: string; kcal?: number | null; protein?: number | null }) =>
    apiFetch(`/vendor/menu/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  createDrop: (data: { menu_item_id: string; discounted_price: number; quantity_available: number; pickup_start_time: string; pickup_end_time: string; expiry?: string }) =>
    apiFetch('/vendor/drops', { method: 'POST', body: JSON.stringify(data) }),

  profile: () => apiFetch('/vendor/profile'),

  updateProfile: (data: { address?: string; phone?: string }) =>
    apiFetch('/vendor/profile', { method: 'PUT', body: JSON.stringify(data) }),

  updateHours: (hours: any) =>
    apiFetch('/vendor/hours', { method: 'PUT', body: JSON.stringify({ hours }) }),

  updateClosures: (dates: string[]) =>
    apiFetch('/vendor/closures', { method: 'PUT', body: JSON.stringify({ dates }) }),

  payoutsSummary: () => apiFetch('/vendor/payouts/summary'),

  payoutsOrders: () => apiFetch('/vendor/payouts/orders'),
};

// Admin endpoints
export const adminApi = {
  vendors: () => apiFetch('/admin/vendors'),

  createVendor: (data: { name: string; category: string; email: string; password: string; phone?: string; place_id?: string; location?: any; logo_url?: string; service_type?: string }) =>
    apiFetch('/admin/vendors', { method: 'POST', body: JSON.stringify(data) }),

  deleteVendor: (id: string) =>
    apiFetch(`/admin/vendors/${id}`, { method: 'DELETE' }),

  vendorMenu: (vendorId: string) =>
    apiFetch(`/admin/vendors/${vendorId}/menu`),

  addMenuItem: (vendorId: string, data: { name: string; description: string; original_price: number; image_url: string }) =>
    apiFetch(`/admin/vendors/${vendorId}/menu`, { method: 'POST', body: JSON.stringify(data) }),

  deleteMenuItem: (id: string) =>
    apiFetch(`/admin/menu-items/${id}`, { method: 'DELETE' }),

  payoutsVendors: () => apiFetch('/admin/payouts/vendors'),

  addPayout: (data: { vendor_id: string; amount: number; note: string }) =>
    apiFetch('/admin/payouts/add', { method: 'POST', body: JSON.stringify(data) }),

  payoutHistory: (vendorId: string) =>
    apiFetch(`/admin/payouts/${vendorId}/history`),

  upload: async (formData: FormData) => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/admin/upload`, {
      method: 'POST',
      body: formData,
      headers,
    });
    if (!res.ok) throw new ApiError(res.status, 'Upload failed');
    return res.json();
  },
};

// Ops dashboard design tokens & helpers
export const C = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFBFC',
  sidebar: '#10231A',
  sidebarItem: '#A7B4AD',
  sidebarActiveBg: '#1E3A2B',
  sidebarActiveText: '#FFFFFF',
  border: '#E6E9ED',
  borderStrong: '#D4D9DF',
  text: '#15171A',
  textSec: '#5B6470',
  textMute: '#98A0AB',
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  primarySoft: '#E8F2E9',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  warn: '#B7791F',
  warnSoft: '#FBF3E2',
  info: '#2563EB',
  infoSoft: '#E7EEFD',
  success: '#15803D',
  successSoft: '#E6F4EA',
};

export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const R = { sm: 6, md: 10, lg: 14, xl: 20, full: 999 };

export const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const hasPerm = (user: any, perm: string): boolean =>
  Array.isArray(user?.permissions) && user.permissions.includes(perm);

export const titleCase = (s?: string) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

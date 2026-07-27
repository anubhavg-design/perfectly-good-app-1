import {
  RefreshCcw, XCircle, DoorClosed, PackageX, CreditCard,
  Clock4, Bug, HelpCircle,
} from 'lucide-react-native';

export interface SupportIssueType {
  key: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  requiresPhoto?: boolean;
  isBug?: boolean;
}

// Single source of truth — add new categories here and both screens update.
export const SUPPORT_ISSUE_TYPES: SupportIssueType[] = [
  { key: 'refund', label: 'Refund', description: 'Request a refund for your order', icon: RefreshCcw, color: '#2E7D32' },
  { key: 'order_cancelled', label: 'Order Cancelled', description: 'My order was cancelled', icon: XCircle, color: '#C65D47' },
  { key: 'restaurant_closed', label: 'Restaurant Closed', description: 'The restaurant was closed', icon: DoorClosed, color: '#B45309' },
  { key: 'wrong_item', label: 'Wrong Item Received', description: 'I got the wrong item', icon: PackageX, color: '#7C3AED', requiresPhoto: true },
  { key: 'payment_issue', label: 'Payment Issue', description: 'Problem with a payment', icon: CreditCard, color: '#0F766E' },
  { key: 'pickup_expired', label: 'Pickup Expired', description: 'I missed my pickup window', icon: Clock4, color: '#64748B' },
  { key: 'app_bug', label: 'App Bug', description: 'Something is not working', icon: Bug, color: '#DC2626', isBug: true },
  { key: 'other', label: 'Other', description: 'Something else', icon: HelpCircle, color: '#475569' },
];

export const getIssueType = (key?: string) =>
  SUPPORT_ISSUE_TYPES.find((t) => t.key === key);

// ── WhatsApp support (only used once an admin enables it on a ticket) ──
export const SUPPORT_WHATSAPP_NUMBER = '919075295333'; // +91 90752 95333
export const SUPPORT_EMAIL = 'anubhavg@perfectlygood.in';

const line = (label: string, value?: any) => (value != null && value !== '' ? `${label}: ${value}\n` : `${label}: -\n`);

// Per-issue WhatsApp message templates (single source of truth).
export const WHATSAPP_TEMPLATES: Record<string, (t: any) => string> = {
  refund: (t) =>
    `Hi Perfectly Good Support,\nIssue: Refund\n` +
    line('Customer', t.customer_name) + line('Order ID', t.order?.order_id) +
    line('Restaurant', t.order?.restaurant_name) + line('Amount', t.order?.order_amount != null ? `₹${t.order.order_amount}` : '') +
    line('Pickup Time', pickup(t)) + line('Reason', t.message),
  order_cancelled: (t) =>
    `Hi Perfectly Good Support,\nIssue: Order Cancelled\n` +
    line('Customer', t.customer_name) + line('Order ID', t.order?.order_id) +
    line('Restaurant', t.order?.restaurant_name) + line('Description', t.message),
  restaurant_closed: (t) =>
    `Hi Perfectly Good Support,\nIssue: Restaurant Closed\n` +
    line('Customer', t.customer_name) + line('Order ID', t.order?.order_id) +
    line('Restaurant', t.order?.restaurant_name) + line('Description', t.message),
  wrong_item: (t) =>
    `Hi Perfectly Good Support,\nIssue: Wrong Item Received\n` +
    line('Customer', t.customer_name) + line('Order ID', t.order?.order_id) +
    line('Restaurant', t.order?.restaurant_name) + line('Description', t.message),
  payment_issue: (t) =>
    `Hi Perfectly Good Support,\nIssue: Payment Issue\n` +
    line('Customer', t.customer_name) + line('Order ID', t.order?.order_id) +
    line('Amount Paid', t.order?.order_amount != null ? `₹${t.order.order_amount}` : '') + line('Description', t.message),
  pickup_expired: (t) =>
    `Hi Perfectly Good Support,\nIssue: Pickup Expired\n` +
    line('Customer', t.customer_name) + line('Order ID', t.order?.order_id) +
    line('Restaurant', t.order?.restaurant_name) + line('Reason', t.message),
  app_bug: (t) =>
    `Hi Perfectly Good Support,\nIssue: App Bug\n` +
    line('Customer', t.customer_name) + line('Device', t.device_model) +
    line('App Version', t.app_version) + line('What happened', t.what_happened || t.message),
  other: (t) =>
    `Hi Perfectly Good Support,\nIssue: Other\n` +
    line('Customer', t.customer_name) + line('Order ID (if applicable)', t.order?.order_id) +
    line('Description', t.message),
};

function pickup(t: any) {
  const s = t.order?.pickup_start_time, e = t.order?.pickup_end_time;
  return s || e ? `${s || ''} - ${e || ''}`.trim() : '';
}

export const buildWhatsappMessage = (ticket: any) => {
  const fn = WHATSAPP_TEMPLATES[ticket.issue_type] || WHATSAPP_TEMPLATES.other;
  return fn(ticket).trim();
};

export const buildWhatsappUrl = (ticket: any) =>
  `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsappMessage(ticket))}`;

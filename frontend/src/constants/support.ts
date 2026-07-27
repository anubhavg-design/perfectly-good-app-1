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

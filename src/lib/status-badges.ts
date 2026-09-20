// =============================================
// Global status badge color system — used across
// admin, user, and provider panels for consistency.
// All values are HSL/Tailwind classes.
// =============================================

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'collected'
  | 'cancelled'
  | 'deleted'
  | 'refunded';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';
export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type PaymentMethod = 'cod' | 'online' | 'razorpay' | 'card' | 'upi';

export interface BadgeStyle {
  bg: string;
  text: string;
  label: string;
}

// === BOOKING / JOB STATUS ===
const BOOKING_BADGES: Record<string, BadgeStyle> = {
  pending:     { bg: 'bg-amber-100',     text: 'text-amber-700',     label: 'Pending' },
  accepted:    { bg: 'bg-blue-100',      text: 'text-blue-700',      label: 'Accepted' },
  confirmed:   { bg: 'bg-blue-100',      text: 'text-blue-700',      label: 'Confirmed' },
  on_the_way:  { bg: 'bg-sky-100',       text: 'text-sky-700',       label: 'On the way' },
  in_progress: { bg: 'bg-violet-100',    text: 'text-violet-700',    label: 'In progress' },
  completed:   { bg: 'bg-emerald-100',   text: 'text-emerald-700',   label: 'Completed' },
  collected:   { bg: 'bg-emerald-100',   text: 'text-emerald-700',   label: 'Collected' },
  cancelled:   { bg: 'bg-red-100',       text: 'text-red-700',       label: 'Cancelled' },
  deleted:     { bg: 'bg-zinc-200',      text: 'text-zinc-700',      label: 'Deleted' },
  refunded:    { bg: 'bg-orange-100',    text: 'text-orange-700',    label: 'Refunded' },
};

export function getBookingBadge(status: string): BadgeStyle {
  return BOOKING_BADGES[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };
}

// === PRIORITY ===
const PRIORITY_BADGES: Record<string, BadgeStyle> = {
  low:    { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Low' },
  medium: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Medium' },
  high:   { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High' },
  urgent: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Urgent' },
};

export function getPriorityBadge(priority: string): BadgeStyle {
  return PRIORITY_BADGES[priority] || { bg: 'bg-muted', text: 'text-muted-foreground', label: priority };
}

// === SUPPORT TICKET STATUS ===
const SUPPORT_BADGES: Record<string, BadgeStyle> = {
  open:        { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Open' },
  in_progress: { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'In progress' },
  resolved:    { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Resolved' },
  closed:      { bg: 'bg-zinc-200',    text: 'text-zinc-700',    label: 'Closed' },
};

export function getSupportBadge(status: string): BadgeStyle {
  return SUPPORT_BADGES[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };
}

// === PAYMENT METHOD ===
const PAYMENT_BADGES: Record<string, BadgeStyle> = {
  cod:      { bg: 'bg-orange-100', text: 'text-orange-700', label: 'COD' },
  online:   { bg: 'bg-sky-100',    text: 'text-sky-700',    label: 'Online' },
  razorpay: { bg: 'bg-sky-100',    text: 'text-sky-700',    label: 'Online' },
  card:     { bg: 'bg-sky-100',    text: 'text-sky-700',    label: 'Card' },
  upi:      { bg: 'bg-sky-100',    text: 'text-sky-700',    label: 'UPI' },
};

export function getPaymentBadge(method: string): BadgeStyle {
  return PAYMENT_BADGES[method] || PAYMENT_BADGES.online;
}

// === PAYMENT STATUS ===
export function getPaymentStatusBadge(status: string): BadgeStyle {
  const map: Record<string, BadgeStyle> = {
    pending:  { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Pending' },
    paid:     { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Paid' },
    refunded: { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'Refunded' },
    failed:   { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Failed' },
  };
  return map[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };
}

// === SHOP DELIVERY STATUS ===
const DELIVERY_BADGES: Record<string, BadgeStyle> = {
  pending:          { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Pending' },
  confirmed:        { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Confirmed' },
  dispatched:       { bg: 'bg-violet-100',  text: 'text-violet-700',  label: 'Dispatched' },
  out_for_delivery: { bg: 'bg-sky-100',     text: 'text-sky-700',     label: 'Out for delivery' },
  delivered:        { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Delivered' },
  cancelled:        { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Cancelled' },
};
export function getDeliveryBadge(status: string): BadgeStyle {
  return DELIVERY_BADGES[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };
}
export const DELIVERY_STEPS = ['pending', 'confirmed', 'dispatched', 'out_for_delivery', 'delivered'] as const;

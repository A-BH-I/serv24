import { useState } from 'react';
import { CreditCard, Loader2, X, IndianRupee } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface RazorpayPaymentProps {
  bookingId: string;
  amount: number;
  onSuccess: () => void;
  onClose: () => void;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: () => void) => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function RazorpayPayment({ bookingId, amount, onSuccess, onClose }: RazorpayPaymentProps) {
  const [processing, setProcessing] = useState(false);

  const handlePayment = async () => {
    setProcessing(true);
    try {
      // 1. Create order on backend
      const res = await api.post<{ order_id: string; razorpay_key: string; amount: number; currency: string }>(`/payments/create-order`, {
        booking_id: bookingId,
        amount,
      });
      const order = res.data;
      if (!order) throw new Error('Failed to create payment order');

      // 2. Load Razorpay SDK
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Failed to load Razorpay. Check your internet connection.');

      // 3. Open Razorpay checkout
      const options = {
        key: order.razorpay_key,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Serv24',
        description: `Payment for booking`,
        order_id: order.order_id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await api.post('/payments/verify', {
              booking_id: bookingId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success('Payment successful!');
            onSuccess();
          } catch {
            toast.error('Payment verification failed. Contact support.');
          }
        },
        prefill: {},
        theme: { color: '#2563eb' },
        modal: { ondismiss: () => setProcessing(false) },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        toast.error('Payment failed. Please try again.');
        setProcessing(false);
      });
      rzp.open();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'Payment failed');
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">Pay Online</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <div className="bg-muted rounded-xl p-4 mb-5 text-center">
          <p className="text-xs text-muted-foreground mb-1">Amount to pay</p>
          <div className="flex items-center justify-center gap-1">
            <IndianRupee className="h-6 w-6 text-foreground" />
            <span className="text-3xl font-bold text-foreground">{amount.toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">UPI, Cards, Net Banking</p>
              <p className="text-xs text-muted-foreground">Powered by Razorpay</p>
            </div>
          </div>
        </div>

        <button onClick={handlePayment} disabled={processing}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm btn-press disabled:opacity-50 flex items-center justify-center gap-2">
          {processing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : `Pay ₹${amount.toLocaleString()}`}
        </button>

        <p className="text-center text-[0.6rem] text-muted-foreground mt-3">
          Secured by Razorpay · 256-bit encryption
        </p>
      </div>
    </div>
  );
}

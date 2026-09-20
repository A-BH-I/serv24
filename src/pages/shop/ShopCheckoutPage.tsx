import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClientLayout } from '@/components/layouts/ClientLayout';
import { ChevronLeft, MapPin, CreditCard, CheckCircle2, Loader2, Banknote } from 'lucide-react';
import { shopApi } from '@/lib/api';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { useShopCart } from '@/hooks/use-shop-cart';
import { toast } from 'sonner';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: () => void) => void };
  }
}
function loadRazorpay(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

type Step = 1 | 2 | 3;

export default function ShopCheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, refresh } = useShopCart();
  const { settings } = useSiteSettings();
  const onlineEnabled = settings.razorpayEnabled === '1';
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [shipping, setShipping] = useState({
    shipping_name: '', shipping_phone: '', shipping_address: '',
    shipping_city: '', shipping_state: '', shipping_pincode: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');

  if (items.length === 0) {
    return (
      <ClientLayout>
        <div className="text-center py-20 px-5">
          <p className="text-sm text-muted-foreground mb-4">Your cart is empty</p>
          <Link to="/shop" className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold btn-press">
            Browse products
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const validateShipping = () => {
    if (!shipping.shipping_name.trim()) return 'Name is required';
    if (!/^\d{10}$/.test(shipping.shipping_phone.replace(/\D/g, ''))) return 'Phone must be 10 digits';
    if (!shipping.shipping_address.trim()) return 'Address is required';
    if (!shipping.shipping_city.trim()) return 'City is required';
    if (!shipping.shipping_state.trim()) return 'State is required';
    if (!/^\d{6}$/.test(shipping.shipping_pincode)) return 'Pincode must be 6 digits';
    return null;
  };

  const placeOrder = async () => {
    setSubmitting(true);
    try {
      const res = await shopApi.checkout({ ...shipping, payment_method: paymentMethod });
      const data = res.data!;
      if (data.payment_method === 'cod') {
        await refresh();
        toast.success('Order placed!');
        navigate(`/shop/order/${data.order_id}?placed=1`, { replace: true });
        return;
      }
      // Online
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Failed to load payment gateway');
      const rz = data.razorpay!;
      const options = {
        key: rz.razorpay_key,
        amount: rz.amount,
        currency: rz.currency || 'INR',
        name: 'Serv24 Shop',
        description: `Order ${data.order_number}`,
        order_id: rz.order_id,
        handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await shopApi.verifyPayment(data.order_id, resp);
            await refresh();
            toast.success('Payment successful!');
            navigate(`/shop/order/${data.order_id}?placed=1`, { replace: true });
          } catch {
            toast.error('Payment verification failed. Contact support.');
          }
        },
        prefill: { name: shipping.shipping_name, contact: shipping.shipping_phone },
        theme: { color: '#0d9488' },
        modal: { ondismiss: () => setSubmitting(false) },
      };
      const rzInst = new window.Razorpay(options);
      rzInst.on('payment.failed', () => { toast.error('Payment failed'); setSubmitting(false); });
      rzInst.open();
    } catch (e) {
      toast.error((e as { message?: string }).message || 'Checkout failed');
      setSubmitting(false);
    }
  };

  return (
    <ClientLayout>
      <div className="px-5 pt-3 pb-3 flex items-center gap-3">
        <button onClick={() => step === 1 ? navigate('/shop/cart') : setStep((step - 1) as Step)} className="p-1.5 rounded-lg hover:bg-muted btn-press" aria-label="Back">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Checkout</h1>
      </div>

      {/* Stepper */}
      <div className="px-5 pb-3">
        <div className="flex items-center justify-between text-[0.65rem]">
          {(['Shipping', 'Payment', 'Review'] as const).map((label, i) => {
            const n = (i + 1) as Step;
            const active = step === n;
            const done = step > n;
            return (
              <div key={label} className="flex items-center gap-1.5 flex-1">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[0.65rem] font-bold ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>{done ? '✓' : n}</div>
                <span className={`font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                {i < 2 && <div className={`flex-1 h-0.5 ${done ? 'bg-emerald-500' : 'bg-muted'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 pb-32 space-y-3">
        {step === 1 && (
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2"><MapPin className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Shipping Address</h2></div>
            <Field label="Full Name" value={shipping.shipping_name} onChange={v => setShipping({ ...shipping, shipping_name: v })} />
            <Field label="Phone (10 digits)" value={shipping.shipping_phone} onChange={v => setShipping({ ...shipping, shipping_phone: v.replace(/\D/g, '').slice(0, 10) })} inputMode="numeric" />
            <Field label="Address" value={shipping.shipping_address} onChange={v => setShipping({ ...shipping, shipping_address: v })} multiline />
            <div className="grid grid-cols-2 gap-2">
              <Field label="City" value={shipping.shipping_city} onChange={v => setShipping({ ...shipping, shipping_city: v })} />
              <Field label="State" value={shipping.shipping_state} onChange={v => setShipping({ ...shipping, shipping_state: v })} />
            </div>
            <Field label="Pincode (6 digits)" value={shipping.shipping_pincode} onChange={v => setShipping({ ...shipping, shipping_pincode: v.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" />
            <button
              onClick={() => { const err = validateShipping(); if (err) toast.error(err); else setStep(2); }}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm btn-press"
            >Continue to Payment</button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2"><CreditCard className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Payment Method</h2></div>
            <button onClick={() => setPaymentMethod('cod')} className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 btn-press ${paymentMethod === 'cod' ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <Banknote className="h-5 w-5 text-orange-600" />
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Cash on Delivery</p>
                <p className="text-[0.65rem] text-muted-foreground">Pay when your order arrives</p>
              </div>
              {paymentMethod === 'cod' && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </button>
            {onlineEnabled ? (
              <button onClick={() => setPaymentMethod('online')} className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 btn-press ${paymentMethod === 'online' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <CreditCard className="h-5 w-5 text-sky-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">Pay Online</p>
                  <p className="text-[0.65rem] text-muted-foreground">UPI, Cards, Net Banking · Razorpay</p>
                </div>
                {paymentMethod === 'online' && <CheckCircle2 className="h-5 w-5 text-primary" />}
              </button>
            ) : (
              <p className="text-[0.7rem] text-muted-foreground px-1">Online payments are currently unavailable. Pay cash on delivery.</p>
            )}
            <button onClick={() => setStep(3)} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm btn-press">Review Order</button>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="text-sm font-bold mb-3">Order Summary</h2>
              <div className="space-y-2">
                {items.map(i => (
                  <div key={i.id} className="flex justify-between text-xs">
                    <span className="text-foreground line-clamp-1 flex-1">{i.name} × {i.quantity}</span>
                    <span className="font-semibold">₹{(Number(i.price) * i.quantity).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-3 pt-3 flex justify-between text-base">
                <span className="font-bold">Total</span>
                <span className="font-bold">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="text-sm font-bold mb-2">Deliver To</h2>
              <p className="text-sm font-semibold">{shipping.shipping_name} · {shipping.shipping_phone}</p>
              <p className="text-xs text-muted-foreground mt-1">{shipping.shipping_address}, {shipping.shipping_city}, {shipping.shipping_state} - {shipping.shipping_pincode}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="text-sm font-bold mb-2">Payment</h2>
              <p className="text-sm">{paymentMethod === 'cod' ? 'Cash on Delivery' : 'Pay Online (Razorpay)'}</p>
            </div>
            <div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border p-3 z-30">
              <div className="max-w-lg mx-auto">
                <button onClick={placeOrder} disabled={submitting} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm btn-press disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Placing order...</> : `Place Order · ₹${subtotal.toLocaleString('en-IN')}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </ClientLayout>
  );
}

function Field({ label, value, onChange, inputMode, multiline }: { label: string; value: string; onChange: (v: string) => void; inputMode?: 'text' | 'numeric'; multiline?: boolean }) {
  return (
    <div>
      <label className="block text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} inputMode={inputMode} className="w-full px-3 py-2 bg-secondary rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      )}
    </div>
  );
}
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { Wallet, TrendingUp, ArrowDownToLine, Calendar, X, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, BarChart3 } from 'lucide-react';
import { providerApi, api } from '@/lib/api';
import { ApiState, StatSkeleton } from '@/components/ApiState';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

interface EarningsData {
  total_jobs: number;
  gross_earnings: number;
  total_commission: number;
  net_earnings: number;
  pending_payout: number;
  cod_earnings: number;
  online_earnings: number;
  today_earnings: number;
  today_jobs: number;
  bank_verified: boolean;
  recent_jobs: { id: string; booking_number: string; final_price: number; commission_amount: number; completed_at: string; service_name: string; payment_method?: string }[];
}

interface PayoutRequest {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  notes?: string;
  created_at: string;
  processed_at?: string;
}

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
  pending: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Pending' },
  processing: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Processing' },
  completed: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Rejected' },
};

export default function ProviderEarningsPage() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Withdrawal modal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [requesting, setRequesting] = useState(false);

  // Withdrawal history
  const [payoutHistory, setPayoutHistory] = useState<PayoutRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const fetchEarnings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await providerApi.getEarnings(period);
      setEarnings(res.data as EarningsData);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Failed to load earnings.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchEarnings(); }, [fetchEarnings]);

  const fetchPayoutHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get<PayoutRequest[]>('/provider/payouts');
      setPayoutHistory((res.data as PayoutRequest[]) || []);
    } catch {
      // Silently fail — history is supplemental
      setPayoutHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (showHistory) fetchPayoutHistory();
  }, [showHistory, fetchPayoutHistory]);

  // Withdrawable = online earnings only (COD already collected by provider) minus pending payouts
  const withdrawable = Math.max(0, (earnings?.online_earnings || 0) - (earnings?.pending_payout || 0));
  const bankVerified = earnings?.bank_verified ?? false;

  const handleWithdrawRequest = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amount > withdrawable) {
      toast.error(`Maximum withdrawable amount is ₹${withdrawable.toLocaleString()}`);
      return;
    }
    if (amount < 100) {
      toast.error('Minimum withdrawal amount is ₹100');
      return;
    }

    setRequesting(true);
    try {
      await providerApi.requestPayout(amount);
      toast.success(`Withdrawal of ₹${amount.toLocaleString()} requested successfully`);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      fetchEarnings();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr?.message || 'Failed to request withdrawal');
    } finally {
      setRequesting(false);
    }
  };

  const stats = earnings || { gross_earnings: 0, total_commission: 0, net_earnings: 0, pending_payout: 0 };

  return (
    <ProviderLayout>
      <div className="px-5 pt-2 pb-4">
        <h1 className="text-lg font-bold text-foreground mb-4">{t('provider.earnings.title')}</h1>
        <div className="flex gap-1 bg-muted rounded-lg p-1 mb-4">
          {(['week', 'month', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all active:scale-[0.97] ${
                period === p ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
              }`}>
              {t(`period.${p}`)}
            </button>
          ))}
        </div>

        <ApiState loading={loading} error={error} onRetry={fetchEarnings} skeleton={<StatSkeleton count={4} />}>
          <div className="grid grid-cols-2 gap-3 animate-fade-up">
            <div className="bg-primary rounded-xl p-4 text-primary-foreground col-span-2">
              <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 opacity-70" /><span className="text-xs opacity-70">{t('provider.earnings.netEarnings')}</span></div>
              <p className="text-2xl font-bold">₹{stats.net_earnings?.toLocaleString() || '0'}</p>
              <div className="flex items-center gap-1 mt-1 text-xs opacity-70"><TrendingUp className="h-3 w-3" /> {t(`period.${period}`)}</div>
            </div>

            {/* Today's Earnings */}
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4 col-span-2">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Today's Earnings</span>
              </div>
              <div className="flex items-baseline gap-3">
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">₹{(earnings?.today_earnings || 0).toLocaleString()}</p>
                <span className="text-xs text-emerald-600/70">{earnings?.today_jobs || 0} job{(earnings?.today_jobs || 0) !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('provider.earnings.withdrawable')}</p>
              <p className="text-lg font-bold text-emerald-600">₹{withdrawable.toLocaleString()}</p>
              <p className="text-[0.6rem] text-muted-foreground mt-0.5">Online payments only</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">COD Collected</p>
              <p className="text-lg font-bold text-foreground">₹{(earnings?.cod_earnings || 0).toLocaleString()}</p>
              <p className="text-[0.6rem] text-muted-foreground mt-0.5">Already in hand</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('provider.earnings.pendingPayout')}</p>
              <p className="text-lg font-bold text-amber-600">₹{(stats.pending_payout || 0).toLocaleString()}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">{t('provider.earnings.grossEarnings')}</p>
              <p className="text-lg font-bold text-foreground">₹{stats.gross_earnings?.toLocaleString() || '0'}</p>
            </div>
          </div>

          {/* Withdraw, History & Wallet buttons */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => {
                if (!bankVerified) {
                  toast.error('Your bank/UPI details must be verified before you can withdraw. Please check Settings → Bank tab.');
                  return;
                }
                setWithdrawAmount(''); setShowWithdrawModal(true);
              }}
              disabled={withdrawable <= 0}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ArrowDownToLine className="h-4 w-4" /> {t('provider.earnings.withdraw')}
            </button>
            <button
              onClick={() => setShowHistory(prev => !prev)}
              className="px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium text-foreground active:scale-[0.97] transition-all"
            >
              {showHistory ? t('common.hide') : t('provider.earnings.history')}
            </button>
            <Link
              to="/provider/wallet"
              className="px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl text-sm font-medium text-primary flex items-center gap-1.5 active:scale-[0.97] transition-all"
            >
              <BarChart3 className="h-4 w-4" />
            </Link>
          </div>

          {/* Withdrawal History */}
          {showHistory && (
            <div className="mt-4 animate-fade-up">
              <h2 className="text-sm font-semibold text-foreground mb-3">{t('provider.earnings.withdrawalHistory')}</h2>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8 bg-card rounded-xl border border-border">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : payoutHistory.length === 0 ? (
                <div className="text-center py-8 bg-card rounded-xl border border-border">
                  <ArrowDownToLine className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('provider.earnings.noWithdrawals')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payoutHistory.map((p, i) => {
                    const config = statusConfig[p.status] || statusConfig.pending;
                    const StatusIcon = config.icon;
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3.5 bg-card rounded-xl border border-border animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                        <div className={`h-9 w-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                          <StatusIcon className={`h-4 w-4 ${config.color} ${p.status === 'processing' ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">₹{Number(p.amount).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">{p.created_at?.split(' ')[0] || p.created_at?.split('T')[0] || '—'}</p>
                          {p.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">Note: {p.notes}</p>}
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[0.6rem] font-semibold uppercase ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Recent Transactions */}
          <div className="mt-6">
             <h2 className="text-sm font-semibold text-foreground mb-3">{t('provider.earnings.recentTransactions')}</h2>
            {!earnings?.recent_jobs?.length ? (
              <div className="text-center py-10 bg-card rounded-xl border border-border">
                <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t('provider.earnings.noTransactions')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {earnings.recent_jobs.map((tx, i) => {
                  const hasCommission = tx.commission_amount > 0;
                  return (
                  <div key={tx.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center"><Calendar className="h-4 w-4 text-primary" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{tx.service_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{tx.completed_at?.split('T')[0]}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                          tx.payment_method === 'cod' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                        }`}>
                          {tx.payment_method === 'cod' ? 'COD' : 'Online'}
                        </span>
                        {hasCommission
                          ? <span>· {t('provider.earnings.commission')}: ₹{tx.commission_amount}</span>
                          : <span className="text-emerald-600 font-medium">No Commission</span>
                        }
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">+₹{(tx.final_price - (tx.commission_amount || 0)).toLocaleString()}</span>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </ApiState>
      </div>

      {/* ============ WITHDRAWAL MODAL ============ */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowWithdrawModal(false)}>
          <div
            className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border animate-fade-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground">{t('provider.earnings.requestWithdrawal')}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t('provider.earnings.processingTime')}</p>
              </div>
              <button onClick={() => setShowWithdrawModal(false)} className="p-1.5 rounded-lg hover:bg-muted active:scale-[0.95]">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Available balance */}
              <div className="bg-emerald-50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-emerald-700 mb-1">{t('provider.earnings.availableForWithdrawal')}</p>
                <p className="text-2xl font-bold text-emerald-700">₹{withdrawable.toLocaleString()}</p>
              </div>

              {/* Amount input */}
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">{t('provider.earnings.withdrawalAmount')}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</span>
                  <input
                    type="number"
                    min="100"
                    max={withdrawable}
                    step="1"
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full pl-8 pr-4 py-3 bg-muted rounded-xl text-lg font-semibold border-2 border-transparent focus:border-primary focus:outline-none"
                    autoFocus
                  />
                </div>

                {/* Quick amount buttons */}
                <div className="flex gap-2 mt-3">
                  {[500, 1000, 2000].filter(a => a <= withdrawable).map(amount => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setWithdrawAmount(String(amount))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all active:scale-[0.97] ${
                        withdrawAmount === String(amount)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      ₹{amount.toLocaleString()}
                    </button>
                  ))}
                  {withdrawable >= 100 && (
                    <button
                      type="button"
                      onClick={() => setWithdrawAmount(String(withdrawable))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all active:scale-[0.97] ${
                        withdrawAmount === String(withdrawable)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      Max
                    </button>
                  )}
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2.5 p-3 bg-muted/60 rounded-xl">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground leading-relaxed">
                   <p>{t('provider.earnings.minWithdrawal')}</p>
                   <p className="mt-1">{t('provider.earnings.processingTime')}</p>
                  <p className="mt-1">Ensure your bank/UPI details are verified in Settings → Bank tab.</p>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleWithdrawRequest}
                disabled={requesting || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {requesting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <><ArrowDownToLine className="h-4 w-4" /> {t('provider.earnings.confirmWithdrawal')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProviderLayout>
  );
}

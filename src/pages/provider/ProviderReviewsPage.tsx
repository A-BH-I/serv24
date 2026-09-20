import { useState, useCallback } from 'react';
import { ProviderLayout } from '@/components/layouts/ProviderLayout';
import { Star, MessageSquare, TrendingUp } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { ApiState, CardSkeleton } from '@/components/ApiState';
import { api, resolveAssetUrl } from '@/lib/api';

interface Review {
  id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  client_name: string;
  client_avatar: string | null;
  service_name: string;
}

interface ReviewSummary {
  total_reviews: number;
  average_rating: number;
  five_star: number;
  four_star: number;
  three_star: number;
  two_star: number;
  one_star: number;
}

interface ReviewsData {
  reviews: Review[];
  summary: ReviewSummary;
}

export default function ProviderReviewsPage() {
  const fetchReviews = useCallback(() => api.get<ReviewsData>('/provider/reviews'), []);
  const { data, loading, error, retry } = useApi<ReviewsData>(fetchReviews);

  const summary = data?.summary;
  const reviews = data?.reviews || [];
  const avg = Number(summary?.average_rating || 0).toFixed(1);
  const total = Number(summary?.total_reviews || 0);

  const bars = [
    { label: '5', count: Number(summary?.five_star || 0) },
    { label: '4', count: Number(summary?.four_star || 0) },
    { label: '3', count: Number(summary?.three_star || 0) },
    { label: '2', count: Number(summary?.two_star || 0) },
    { label: '1', count: Number(summary?.one_star || 0) },
  ];
  const maxBar = Math.max(...bars.map(b => b.count), 1);

  return (
    <ProviderLayout>
      <div className="px-5 pt-12 pb-6 animate-fade-up">
        <h1 className="text-xl font-bold text-foreground mb-1">Reviews & Ratings</h1>
        <p className="text-sm text-muted-foreground mb-6">Your customer feedback</p>

        <ApiState loading={loading} error={error} onRetry={retry} skeleton={<CardSkeleton count={3} />}>
          {/* Summary Card */}
          <div className="bg-card rounded-2xl border border-border p-6 mb-6">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-foreground">{avg}</p>
                <div className="flex gap-0.5 justify-center mt-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(Number(avg)) ? 'text-amber-400 fill-amber-400' : 'text-border'}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{total} reviews</p>
              </div>

              <div className="flex-1 space-y-1.5">
                {bars.map(bar => (
                  <div key={bar.label} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-3">{bar.label}</span>
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(bar.count / maxBar) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right">{bar.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Reviews List */}
          {reviews.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No reviews yet</p>
              <p className="text-xs text-muted-foreground mt-1">Complete jobs to start receiving feedback</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review, i) => (
                <div key={review.id} className="bg-card rounded-xl border border-border p-4 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0 overflow-hidden">
                      {review.client_avatar
                        ? <img src={resolveAssetUrl(review.client_avatar)} alt="" className="h-full w-full object-cover" />
                        : review.client_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{review.client_name}</p>
                        <span className="text-[10px] text-muted-foreground">{new Date(review.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`h-3 w-3 ${s <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-border'}`} />
                        ))}
                        <span className="text-xs text-muted-foreground ml-1">· {review.service_name}</span>
                      </div>
                      {review.review_text && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{review.review_text}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ApiState>
      </div>
    </ProviderLayout>
  );
}

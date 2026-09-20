// =============================================
// Shared category icon rendering utility
// Developed by ssharmaji
// =============================================
import { resolveAssetUrl } from '@/lib/api';
import {
  Wrench, Zap, Droplets, PaintBucket, Hammer, Wind, Bug, Truck,
  Home, Scissors, Sparkles, Leaf, Monitor, Lock, Flame, ShowerHead, Paintbrush
} from 'lucide-react';

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  plumb: Droplets, electric: Zap, clean: Sparkles, paint: PaintBucket,
  carpent: Hammer, ac: Wind, pest: Bug, mov: Truck, repair: Wrench,
  home: Home, salon: Scissors, garden: Leaf, tech: Monitor, lock: Lock,
  gas: Flame, bath: ShowerHead,
};

export const searchIconMap: Record<string, typeof Wrench> = {
  Plumbing: Wrench, Painting: Paintbrush, Electrical: Zap, Cleaning: Sparkles,
  'AC Repair': Wind, 'Pest Control': Bug, Carpentry: Hammer, Moving: Truck,
};

export const searchColorMap: Record<string, { bg: string; icon: string }> = {
  Plumbing: { bg: 'bg-blue-50', icon: 'text-blue-600' },
  Painting: { bg: 'bg-orange-50', icon: 'text-orange-600' },
  Electrical: { bg: 'bg-yellow-50', icon: 'text-yellow-600' },
  Cleaning: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  'AC Repair': { bg: 'bg-sky-50', icon: 'text-sky-600' },
  'Pest Control': { bg: 'bg-red-50', icon: 'text-red-600' },
  Carpentry: { bg: 'bg-amber-50', icon: 'text-amber-700' },
  Moving: { bg: 'bg-violet-50', icon: 'text-violet-600' },
};

export const defaultSearchColor = { bg: 'bg-primary/10', icon: 'text-primary' };

export function getCategoryFallbackIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, Icon] of Object.entries(categoryIconMap)) {
    if (lower.includes(key)) return Icon;
  }
  return Wrench;
}

/**
 * Checks if icon_url is an emoji value (stored as "emoji:🔧")
 * Handles potential encoding issues by checking multiple patterns
 */
function isEmojiIcon(iconUrl: string): boolean {
  if (iconUrl.startsWith('emoji:')) return true;
  // Handle URL-encoded version
  if (iconUrl.startsWith('emoji%3A')) return true;
  return false;
}

function getEmojiFromUrl(iconUrl: string): string {
  if (iconUrl.startsWith('emoji:')) return iconUrl.slice(6);
  if (iconUrl.startsWith('emoji%3A')) return decodeURIComponent(iconUrl.slice(0));
  return iconUrl;
}

/**
 * Renders a category icon: emoji, uploaded image, or fallback Lucide icon
 */
export function CategoryIcon({
  iconUrl,
  name,
  size = 'md',
  fallbackClassName,
}: {
  iconUrl?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  fallbackClassName?: string;
}) {
  const sizeMap = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' };
  const imgSizeMap = { sm: 'h-5 w-5', md: 'h-6 w-6', lg: 'h-7 w-7' };
  const iconSizeMap = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' };

  if (iconUrl && isEmojiIcon(iconUrl)) {
    return <span className={sizeMap[size]}>{getEmojiFromUrl(iconUrl)}</span>;
  }

  if (iconUrl && iconUrl.length > 1) {
    // Check if it's just a raw emoji character (not prefixed)
    const codePoint = iconUrl.codePointAt(0) || 0;
    if (codePoint > 255 && iconUrl.length <= 4) {
      return <span className={sizeMap[size]}>{iconUrl}</span>;
    }

    return (
      <img
        src={resolveAssetUrl(iconUrl)}
        alt={name}
        className={`${imgSizeMap[size]} object-contain`}
        onError={(e) => {
          // Hide broken image, show fallback
          (e.currentTarget as HTMLImageElement).style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling;
          if (fallback) (fallback as HTMLElement).style.display = '';
        }}
      />
    );
  }

  const FallbackIcon = getCategoryFallbackIcon(name);
  return <FallbackIcon className={`${iconSizeMap[size]} ${fallbackClassName || 'text-primary'}`} />;
}

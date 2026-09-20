import { Globe } from 'lucide-react';
import { useI18n, LANGUAGE_OPTIONS } from '@/lib/i18n';

export function LanguageSelector() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="mt-4 bg-card rounded-xl border border-border p-4 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('misc.appLanguage')}</h3>
      </div>
      <div className="flex gap-2">
        {LANGUAGE_OPTIONS.map(opt => (
          <button
            key={opt.code}
            onClick={() => setLang(opt.code)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97] ${
              lang === opt.code
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.nativeLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

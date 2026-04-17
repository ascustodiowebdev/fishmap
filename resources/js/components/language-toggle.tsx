import { Button } from '@/components/ui/button';
import { useTranslator } from '@/lib/i18n';
import { router } from '@inertiajs/react';

export function LanguageToggle() {
    const { locale } = useTranslator();
    const nextLocale = locale === 'en' ? 'pt' : 'en';
    const nextLabel = nextLocale.toUpperCase();

    return (
        <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-sm backdrop-blur">
            <Button
                type="button"
                size="sm"
                variant="default"
                className="h-8 min-w-10 rounded-full px-3 text-xs sm:min-w-11"
                onClick={() => {
                    router.post(route('locale.update'), { locale: nextLocale }, { preserveScroll: true });
                }}
            >
                {nextLabel}
            </Button>
        </div>
    );
}

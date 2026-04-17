import { Button } from '@/components/ui/button';
import { useTranslator } from '@/lib/i18n';
import { router } from '@inertiajs/react';

export function LanguageToggle() {
    const { locale } = useTranslator();

    return (
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-sm backdrop-blur">
            <Button
                type="button"
                size="sm"
                variant={locale === 'en' ? 'default' : 'ghost'}
                className="h-8 min-w-11 rounded-full px-3"
                onClick={() => {
                    if (locale !== 'en') {
                        router.post(route('locale.update'), { locale: 'en' }, { preserveScroll: true });
                    }
                }}
            >
                EN
            </Button>
            <Button
                type="button"
                size="sm"
                variant={locale === 'pt' ? 'default' : 'ghost'}
                className="h-8 min-w-11 rounded-full px-3"
                onClick={() => {
                    if (locale !== 'pt') {
                        router.post(route('locale.update'), { locale: 'pt' }, { preserveScroll: true });
                    }
                }}
            >
                PT
            </Button>
        </div>
    );
}

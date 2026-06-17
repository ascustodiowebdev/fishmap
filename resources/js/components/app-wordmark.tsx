import { cn } from '@/lib/utils';

export default function AppWordmark({ className, alt = 'NautiBite' }: { className?: string; alt?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-2 overflow-hidden', className)}>
            <img src="/branding/nautibite-logo.svg" alt={alt} className="h-full shrink-0 object-contain" />
            <span className="truncate text-lg font-semibold text-current">NautiBite</span>
        </span>
    );
}

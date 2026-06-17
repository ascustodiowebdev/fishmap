import { cn } from '@/lib/utils';

export default function AppWordmark({ className, alt = 'NautiBite' }: { className?: string; alt?: string }) {
    return (
        <span className={cn('inline-flex items-center overflow-hidden', className)}>
            <img src="/branding/nautibite-logo.svg" alt={alt} className="h-full w-full object-contain object-center" />
        </span>
    );
}

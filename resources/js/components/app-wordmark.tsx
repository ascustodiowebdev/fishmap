import { cn } from '@/lib/utils';

export default function AppWordmark({ className, alt = 'TidePilot' }: { className?: string; alt?: string }) {
    return (
        <span className={cn('relative inline-flex [aspect-ratio:3.8/1] overflow-hidden', className)}>
            <img src="/branding/tidepilot-logo.svg" alt={alt} className="absolute inset-0 h-full w-full object-contain object-left" />
        </span>
    );
}

import { cn } from '@/lib/utils';

export default function AppWordmark({ className, alt = 'Fishmap' }: { className?: string; alt?: string }) {
    return (
        <span className={cn('relative inline-flex overflow-hidden [aspect-ratio:3.8/1]', className)}>
            <img
                src="/branding/fishmap-logo.svg"
                alt={alt}
                className="absolute top-1/2 left-0 h-[88%] w-full max-w-none -translate-y-1/2 origin-left scale-[3.05] object-contain object-left"
            />
        </span>
    );
}

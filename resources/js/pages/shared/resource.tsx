import AppWordmark from '@/components/app-wordmark';
import { Button } from '@/components/ui/button';
import { Head, Link } from '@inertiajs/react';
import { CalendarDays, Fish, type LucideIcon, MapPin, Route as RouteIcon } from 'lucide-react';

type SharedKind = 'spot' | 'route';

interface SharedPoint {
    sequence?: number;
    latitude: string;
    longitude: string;
    recorded_at: string | null;
}

interface SharedResource {
    id: number;
    title: string;
    owner_name: string | null;
    notes?: string | null;
    bait_used?: string | null;
    photo_url?: string | null;
    caught_at?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
    point_count?: number;
    latitude: string | null;
    longitude: string | null;
    points: SharedPoint[];
}

interface SharedResourceProps {
    kind: SharedKind;
    resource: SharedResource;
}

export default function SharedResourcePage({ kind, resource }: SharedResourceProps) {
    const isRoute = kind === 'route';
    const coordinates = formatCoordinates(resource.latitude, resource.longitude);
    const mapsUrl = coordinates ? `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}` : null;
    const visiblePoints = resource.points.slice(0, 80);

    return (
        <main className="min-h-svh bg-[#081217] px-4 py-5 text-slate-950 sm:px-6 lg:px-8 dark:text-slate-50">
            <Head title={`${resource.title} - NautiBite`} />

            <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-3xl flex-col">
                <header className="flex items-center justify-between gap-3 py-3">
                    <Link href={route('home')}>
                        <AppWordmark className="h-8 w-[180px]" />
                    </Link>
                    <Link
                        href={route('home')}
                        className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/14"
                    >
                        NautiBite
                    </Link>
                </header>

                <section className="mt-6 rounded-[1.75rem] border border-white/12 bg-white p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] sm:p-7 dark:bg-slate-950">
                    <div className="flex items-start gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300">
                            {isRoute ? <RouteIcon className="size-6" /> : <Fish className="size-6" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase dark:text-teal-300">
                                {isRoute ? 'Shared route' : 'Shared fish spot'}
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-50">
                                {resource.title}
                            </h1>
                            {resource.owner_name ? (
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Shared by {resource.owner_name}</p>
                            ) : null}
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <InfoCard
                            icon={MapPin}
                            label="Coordinates"
                            value={coordinates ? `${coordinates.latitude}, ${coordinates.longitude}` : 'Not available'}
                        />
                        <InfoCard
                            icon={CalendarDays}
                            label={isRoute ? 'Route date' : 'Catch date'}
                            value={isRoute ? formatDate(resource.started_at) : formatDate(resource.caught_at)}
                        />
                    </div>

                    {isRoute ? (
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                                {resource.point_count ?? resource.points.length} recorded points
                            </p>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                {resource.ended_at ? `Ended ${formatDate(resource.ended_at)}` : 'Route end time not set'}
                            </p>
                        </div>
                    ) : null}

                    {!isRoute && (resource.bait_used || resource.notes || resource.photo_url) ? (
                        <div className="mt-5 grid gap-3">
                            {resource.bait_used ? <TextBlock label="Bait" value={resource.bait_used} /> : null}
                            {resource.notes ? <TextBlock label="Notes" value={resource.notes} /> : null}
                            {resource.photo_url ? (
                                <a
                                    href={resource.photo_url}
                                    className="text-sm font-semibold text-teal-800 hover:text-teal-700 dark:text-teal-300 dark:hover:text-teal-200"
                                >
                                    Open photo
                                </a>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        {mapsUrl ? (
                            <Button asChild>
                                <a href={mapsUrl} target="_blank" rel="noreferrer">
                                    Open in Google Maps
                                </a>
                            </Button>
                        ) : null}
                        <Button asChild variant="outline">
                            <Link href={route('home')}>Open NautiBite</Link>
                        </Button>
                    </div>
                </section>

                {isRoute && visiblePoints.length > 0 ? (
                    <section className="mt-4 rounded-[1.75rem] border border-white/12 bg-white p-5 shadow-[0_28px_90px_rgba(0,0,0,0.22)] sm:p-7 dark:bg-slate-950">
                        <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Route points</h2>
                        <div className="mt-4 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                            {visiblePoints.map((point, index) => (
                                <div
                                    key={`${point.sequence ?? index}-${point.recorded_at ?? index}`}
                                    className="grid gap-1 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800"
                                >
                                    <p className="font-semibold text-slate-900 dark:text-slate-100">Point {point.sequence ?? index + 1}</p>
                                    <p className="text-slate-600 dark:text-slate-300">
                                        {point.latitude}, {point.longitude}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(point.recorded_at)}</p>
                                </div>
                            ))}
                        </div>
                        {resource.points.length > visiblePoints.length ? (
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                Showing first {visiblePoints.length} points of {resource.points.length}.
                            </p>
                        ) : null}
                    </section>
                ) : null}
            </div>
        </main>
    );
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase dark:text-slate-400">
                <Icon className="size-4" />
                {label}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-slate-50">{value}</p>
        </div>
    );
}

function TextBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase dark:text-slate-400">{label}</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{value}</p>
        </div>
    );
}

function formatCoordinates(latitude: string | null, longitude: string | null) {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
        return null;
    }

    return {
        latitude: parsedLatitude.toFixed(6),
        longitude: parsedLongitude.toFixed(6),
    };
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return 'Not set';
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return 'Not set';
    }

    return parsed.toLocaleString();
}

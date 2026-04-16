import { CatchMap } from '@/components/catch-map';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { type BreadcrumbItem, type CatchLog, type SharedData } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Crosshair, Fish, Globe, MapPinned, Plus, Waves } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface DashboardProps {
    catchLogs: CatchLog[];
    stats: {
        total_catches: number;
        public_spots: number;
        latest_trip: string | null;
    };
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Fishmap',
        href: '/dashboard',
    },
];

const inputClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100';

export default function Dashboard({ catchLogs, stats }: DashboardProps) {
    const { auth, flash } = usePage<SharedData>().props;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isInitialMapLoading, setIsInitialMapLoading] = useState(true);
    const [currentTrackedPosition, setCurrentTrackedPosition] = useState<[number, number] | null>(null);
    const [recenterSignal, setRecenterSignal] = useState(0);
    const form = useForm({
        species: '',
        bait_used: '',
        fish_length_cm: '',
        fish_weight_kg: '',
        caught_at: '',
        latitude: '',
        longitude: '',
        photo_url: '',
        notes: '',
        visibility: 'private' as CatchLog['visibility'],
    });

    const selectedPosition = useMemo<[number, number] | null>(() => {
        const latitude = Number(form.data.latitude);
        const longitude = Number(form.data.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        return [latitude, longitude];
    }, [form.data.latitude, form.data.longitude]);

    const setCoordinates = useCallback(
        ([latitude, longitude]: [number, number]) => {
            form.setData('latitude', latitude.toFixed(7));
            form.setData('longitude', longitude.toFixed(7));
        },
        [form],
    );

    const useCurrentPosition = useCallback(() => {
        if (!('geolocation' in navigator)) {
            return;
        }

        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            return;
        }

        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                setCoordinates([coords.latitude, coords.longitude]);
            },
            () => undefined,
            {
                enableHighAccuracy: true,
                maximumAge: 60_000,
                timeout: 15_000,
            },
        );
    }, [setCoordinates]);

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        form.post(route('catch-logs.store'), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset('species', 'bait_used', 'fish_length_cm', 'fish_weight_kg', 'caught_at', 'photo_url', 'notes');
                setDialogOpen(false);
            },
        });
    };

    const latestTripLabel = stats.latest_trip ? new Date(stats.latest_trip).toLocaleDateString() : 'No trips yet';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Fishmap">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="flex h-[calc(100vh-5rem)] flex-col p-3 md:p-4">
                <section className="relative min-h-0 flex-1 overflow-hidden rounded-[2rem]">
                    <CatchMap
                        catchLogs={catchLogs}
                        selectedPosition={selectedPosition}
                        onSelectPosition={(position) => {
                            setCoordinates(position);
                        }}
                        onCurrentPositionChange={(position) => {
                            setCurrentTrackedPosition(position);
                            if (!selectedPosition) {
                                if (position) {
                                    setCoordinates(position);
                                }
                            }
                        }}
                        onInteractionChange={() => undefined}
                        recenterToCurrentSignal={recenterSignal}
                        onInitialLoadChange={setIsInitialMapLoading}
                    />

                    <div
                        className={`pointer-events-none absolute inset-x-4 top-4 z-[520] flex flex-col gap-3 transition-opacity duration-200 md:left-4 md:right-auto md:w-[360px] ${
                            isInitialMapLoading ? 'opacity-0' : 'opacity-100'
                        }`}
                    >
                        <div className="pointer-events-auto rounded-[1.5rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                            <p className="text-xs font-semibold tracking-[0.22em] text-teal-800 uppercase">Fishmap</p>
                            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Live map</h1>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                Tap anywhere on the water to choose a catch spot, then save the fish from the floating action button.
                            </p>
                        </div>

                        <div className="pointer-events-auto grid grid-cols-3 gap-3">
                            <StatCard icon={Fish} label="Catches" value={stats.total_catches.toString()} />
                            <StatCard icon={Globe} label="Public" value={stats.public_spots.toString()} />
                            <StatCard icon={Waves} label="Latest" value={latestTripLabel} compact />
                        </div>
                        {flash.success ? <StatusBanner type="info" message={flash.success} /> : null}
                    </div>

                    <div className="absolute right-4 bottom-4 z-[500] flex flex-col gap-3 md:right-5 md:bottom-5">
                        <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-12 w-12 rounded-full shadow-lg"
                            onClick={() => {
                                if (currentTrackedPosition) {
                                    setRecenterSignal(Date.now());
                                } else {
                                    useCurrentPosition();
                                }
                            }}
                        >
                            <Crosshair />
                        </Button>

                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                                <Button type="button" className="h-14 rounded-full px-5 shadow-lg">
                                    <Plus className="size-4" />
                                    Add fish
                                </Button>
                            </DialogTrigger>

                            <DialogContent className="left-1/2 top-auto bottom-0 max-h-[85vh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 rounded-t-[1.75rem] rounded-b-none border-slate-200 p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem]">
                                <div className="p-6">
                                    <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
                                    <DialogHeader>
                                        <DialogTitle className="text-2xl tracking-tight text-slate-950">Add a catch</DialogTitle>
                                        <DialogDescription className="text-sm leading-6 text-slate-600">
                                            The location comes from the selected map spot. Keep the details lightweight so logging is fast on mobile.
                                        </DialogDescription>
                                    </DialogHeader>

                                    <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                        <div className="flex items-start gap-3">
                                            <MapPinned className="mt-0.5 size-4 text-teal-700" />
                                            <div>
                                                <p className="font-medium text-slate-900">Selected spot</p>
                                                <p className="mt-1">
                                                    {selectedPosition
                                                        ? `${selectedPosition[0].toFixed(7)}, ${selectedPosition[1].toFixed(7)}`
                                                        : 'Use the crosshair button or tap the map before saving a catch.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <form onSubmit={submit} className="mt-6 grid gap-4">
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <Field label="Species" error={form.errors.species}>
                                                <input
                                                    value={form.data.species}
                                                    onChange={(event) => form.setData('species', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder="Sea bass"
                                                />
                                            </Field>

                                            <Field label="Bait used" error={form.errors.bait_used}>
                                                <input
                                                    value={form.data.bait_used}
                                                    onChange={(event) => form.setData('bait_used', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder="Soft lure"
                                                />
                                            </Field>
                                        </div>

                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <Field label="Length (cm)" error={form.errors.fish_length_cm}>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={form.data.fish_length_cm}
                                                    onChange={(event) => form.setData('fish_length_cm', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder="48.5"
                                                />
                                            </Field>

                                            <Field label="Weight (kg)" error={form.errors.fish_weight_kg}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={form.data.fish_weight_kg}
                                                    onChange={(event) => form.setData('fish_weight_kg', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder="1.80"
                                                />
                                            </Field>

                                            <Field label="When" error={form.errors.caught_at}>
                                                <input
                                                    type="datetime-local"
                                                    value={form.data.caught_at}
                                                    onChange={(event) => form.setData('caught_at', event.target.value)}
                                                    className={inputClassName}
                                                />
                                            </Field>
                                        </div>

                                        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                                            <Field label="Photo URL" error={form.errors.photo_url}>
                                                <input
                                                    type="url"
                                                    value={form.data.photo_url}
                                                    onChange={(event) => form.setData('photo_url', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder="https://..."
                                                />
                                            </Field>

                                            <Field label="Visibility" error={form.errors.visibility}>
                                                <select
                                                    value={form.data.visibility}
                                                    onChange={(event) => form.setData('visibility', event.target.value as CatchLog['visibility'])}
                                                    className={inputClassName}
                                                >
                                                    <option value="private">Private</option>
                                                    <option value="friends">Friends</option>
                                                    <option value="public">Public</option>
                                                </select>
                                            </Field>
                                        </div>

                                        <Field label="Notes" error={form.errors.notes}>
                                            <textarea
                                                value={form.data.notes}
                                                onChange={(event) => form.setData('notes', event.target.value)}
                                                className={`${inputClassName} min-h-28 resize-y`}
                                                placeholder="Time of day, current, weather, or why this spot worked."
                                            />
                                        </Field>

                                        <div className="flex items-center justify-between gap-3 border-t pt-4">
                                            <p className="text-sm text-slate-500">Coordinates are taken from the map automatically.</p>
                                            <Button type="submit" disabled={form.processing || !selectedPosition} className="rounded-full px-5">
                                                {form.processing ? 'Saving...' : 'Save catch'}
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </section>
            </div>
        </AppLayout>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">{label}</span>
            {children}
            {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </label>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    compact = false,
}: {
    icon: typeof Fish;
    label: string;
    value: string;
    compact?: boolean;
}) {
    return (
        <div className="rounded-[1.35rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
            <Icon className="size-4 text-teal-700" />
            <p className={`mt-3 font-semibold text-slate-950 ${compact ? 'text-sm' : 'text-2xl'}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-500 uppercase tracking-[0.18em]">{label}</p>
        </div>
    );
}

function StatusBanner({ type, message }: { type: 'info' | 'warning'; message: string }) {
    return (
        <div
            className={`pointer-events-auto rounded-[1.35rem] border px-4 py-3 text-sm shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur ${
                type === 'warning'
                    ? 'border-amber-200 bg-amber-50/92 text-amber-900'
                    : 'border-white/70 bg-white/88 text-slate-700'
            }`}
        >
            {message}
        </div>
    );
}

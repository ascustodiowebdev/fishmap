import { CatchMap } from '@/components/catch-map';
import { Button } from '@/components/ui/button';
import { type BreadcrumbItem, type CatchLog, type SharedData } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Fish, Globe, Lock, Waves } from 'lucide-react';

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
        title: 'Dashboard',
        href: '/dashboard',
    },
];

const statCards = [
    {
        key: 'total_catches',
        label: 'Saved catches',
        icon: Fish,
    },
    {
        key: 'public_spots',
        label: 'Public spots',
        icon: Globe,
    },
] as const;

const inputClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100';
const hasSatelliteLayer = Boolean(import.meta.env.VITE_MAPTILER_KEY);

export default function Dashboard({ catchLogs, stats }: DashboardProps) {
    const { auth, flash } = usePage<SharedData>().props;
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

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        form.post(route('catch-logs.store'), {
            preserveScroll: true,
            onSuccess: () =>
                form.reset('species', 'bait_used', 'fish_length_cm', 'fish_weight_kg', 'caught_at', 'latitude', 'longitude', 'photo_url', 'notes'),
        });
    };

    const latestTripLabel = stats.latest_trip ? new Date(stats.latest_trip).toLocaleString() : 'No trips logged yet';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(135deg,_#0f172a_0%,_#134e4a_55%,_#c4f1f9_180%)] p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
                    <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="text-xs font-medium tracking-[0.22em] text-teal-100 uppercase">Welcome back</p>
                            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl" style={{ fontFamily: 'Manrope, sans-serif' }}>
                                {auth.user?.name}, your water log is ready.
                            </h1>
                            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-200">
                                Keep Fishmap simple for now: add catches, store coordinates, and build a clean history before we layer in maps and
                                navigation.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            {statCards.map((card) => (
                                <div key={card.key} className="min-w-36 rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                                    <card.icon className="size-4 text-teal-100" />
                                    <p className="mt-4 text-2xl font-semibold">{stats[card.key]}</p>
                                    <p className="mt-1 text-sm text-slate-200">{card.label}</p>
                                </div>
                            ))}
                            <div className="min-w-36 rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                                <Waves className="size-4 text-teal-100" />
                                <p className="mt-4 text-sm font-semibold">{latestTripLabel}</p>
                                <p className="mt-1 text-sm text-slate-200">Latest trip</p>
                            </div>
                        </div>
                    </div>
                </section>

                {flash.success ? (
                    <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{flash.success}</div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                    <section className="rounded-[1.75rem] border bg-card p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-teal-800">New catch</p>
                                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Save a fishing note</h2>
                            </div>
                            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">Phase 1</div>
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

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Latitude" error={form.errors.latitude}>
                                    <input
                                        type="number"
                                        step="0.0000001"
                                        value={form.data.latitude}
                                        onChange={(event) => form.setData('latitude', event.target.value)}
                                        className={inputClassName}
                                        placeholder="38.7222524"
                                    />
                                </Field>

                                <Field label="Longitude" error={form.errors.longitude}>
                                    <input
                                        type="number"
                                        step="0.0000001"
                                        value={form.data.longitude}
                                        onChange={(event) => form.setData('longitude', event.target.value)}
                                        className={inputClassName}
                                        placeholder="-9.1393366"
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
                                <p className="text-sm text-slate-500">Map pins and route recording come next. This screen gives you the core log first.</p>
                                <Button type="submit" disabled={form.processing} className="rounded-full px-5">
                                    {form.processing ? 'Saving...' : 'Save catch'}
                                </Button>
                            </div>
                        </form>
                    </section>

                    <section className="rounded-[1.75rem] border bg-card p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-teal-800">Catch history</p>
                                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Recent entries</h2>
                            </div>
                            <div className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">{catchLogs.length} total</div>
                        </div>

                        <div className="mt-6 space-y-3">
                            {catchLogs.length === 0 ? (
                                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                                    <Lock className="mx-auto size-5 text-slate-400" />
                                    <h3 className="mt-4 text-lg font-semibold text-slate-900">No catches saved yet</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                        Add your first entry and Fishmap will start building your private fishing history.
                                    </p>
                                </div>
                            ) : (
                                catchLogs.map((catchLog) => (
                                    <article key={catchLog.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-lg font-semibold text-slate-950">{catchLog.species}</h3>
                                                    <VisibilityBadge visibility={catchLog.visibility} />
                                                </div>
                                                <p className="mt-1 text-sm text-slate-500">
                                                    {catchLog.caught_at ? new Date(catchLog.caught_at).toLocaleString() : 'Date not set'}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                                                {catchLog.fish_length_cm ? <MetaPill label={`${catchLog.fish_length_cm} cm`} /> : null}
                                                {catchLog.fish_weight_kg ? <MetaPill label={`${catchLog.fish_weight_kg} kg`} /> : null}
                                                {catchLog.bait_used ? <MetaPill label={catchLog.bait_used} /> : null}
                                            </div>
                                        </div>

                                        {(catchLog.latitude && catchLog.longitude) || catchLog.notes || catchLog.photo_url ? (
                                            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                                                <div className="space-y-2">
                                                    {catchLog.notes ? <p className="text-sm leading-6 text-slate-700">{catchLog.notes}</p> : null}
                                                    {catchLog.latitude && catchLog.longitude ? (
                                                        <p className="text-xs tracking-wide text-slate-500 uppercase">
                                                            {catchLog.latitude}, {catchLog.longitude}
                                                        </p>
                                                    ) : null}
                                                </div>

                                                {catchLog.photo_url ? (
                                                    <a
                                                        href={catchLog.photo_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-sm font-medium text-teal-800 transition hover:text-teal-700"
                                                    >
                                                        Open photo
                                                    </a>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </article>
                                ))
                            )}
                        </div>
                    </section>
                </div>

                <section className="rounded-[1.75rem] border bg-card p-5 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-sm font-medium text-teal-800">Map view</p>
                            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Catch locations</h2>
                        </div>
                        <p className="text-sm text-slate-500">
                            {hasSatelliteLayer ? 'OpenStreetMap plus satellite toggle is enabled.' : 'OpenStreetMap is active. Add a MapTiler key to enable satellite.'}
                        </p>
                    </div>

                    <div className="mt-6">
                        <CatchMap catchLogs={catchLogs} />
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

function MetaPill({ label }: { label: string }) {
    return <span className="rounded-full bg-slate-100 px-3 py-1">{label}</span>;
}

function VisibilityBadge({ visibility }: { visibility: CatchLog['visibility'] }) {
    const classes = {
        private: 'bg-slate-100 text-slate-700',
        friends: 'bg-amber-100 text-amber-800',
        public: 'bg-teal-100 text-teal-800',
    };

    return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${classes[visibility]}`}>{visibility}</span>;
}

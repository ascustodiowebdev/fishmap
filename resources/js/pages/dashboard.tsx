import { CatchMap } from '@/components/catch-map';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type BreadcrumbItem, type CatchLog, type SharedData } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { CheckCircle2, Crosshair, Fish, Globe, LoaderCircle, MapPinned, Plus, Waves } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

interface DashboardProps {
    catchLogs: CatchLog[];
    stats: {
        total_catches: number;
        public_spots: number;
        latest_trip: string | null;
    };
}

type CatchFlowStep = 'action' | 'location-mode' | 'confirm-location' | 'details' | 'navigation' | 'delete' | 'success';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Fishmap',
        href: '/dashboard',
    },
];

const inputClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100';

export default function Dashboard({ catchLogs, stats }: DashboardProps) {
    const { flash } = usePage<SharedData>().props;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogStep, setDialogStep] = useState<CatchFlowStep>('action');
    const [isInitialMapLoading, setIsInitialMapLoading] = useState(true);
    const [currentTrackedPosition, setCurrentTrackedPosition] = useState<[number, number] | null>(null);
    const [recenterSignal, setRecenterSignal] = useState(0);
    const [mapPickMode, setMapPickMode] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [activeCatch, setActiveCatch] = useState<CatchLog | null>(null);
    const [successTitle, setSuccessTitle] = useState('Fish added');
    const [successMessage, setSuccessMessage] = useState('Your catch pin has been saved to Fishmap.');
    const successCloseTimer = useRef<number | null>(null);

    const form = useForm({
        species: '',
        bait_used: '',
        notes: '',
        photo_url: '',
        fish_length_cm: '',
        fish_weight_kg: '',
        caught_date: formatDateForDisplay(new Date()),
        caught_time: formatTimeForDisplay(new Date()),
        visibility: 'private' as 'private' | 'public',
        latitude: '',
        longitude: '',
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

    const syncCurrentCatchTimestamp = useCallback(() => {
        const now = new Date();
        form.setData('caught_date', formatDateForDisplay(now));
        form.setData('caught_time', formatTimeForDisplay(now));
    }, [form]);

    const populateForm = useCallback(
        (catchLog?: CatchLog | null) => {
            if (!catchLog) {
                const now = new Date();
                form.setData({
                    species: '',
                    bait_used: '',
                    notes: '',
                    photo_url: '',
                    fish_length_cm: '',
                    fish_weight_kg: '',
                    caught_date: formatDateForDisplay(now),
                    caught_time: formatTimeForDisplay(now),
                    visibility: 'private',
                    latitude: '',
                    longitude: '',
                });
                form.clearErrors();
                return;
            }

            const caughtAt = catchLog.caught_at ? new Date(catchLog.caught_at) : new Date();
            const nextValues = {
                species: catchLog.species ?? '',
                bait_used: catchLog.bait_used ?? '',
                notes: catchLog.notes ?? '',
                photo_url: catchLog.photo_url ?? '',
                fish_length_cm: catchLog.fish_length_cm ?? '',
                fish_weight_kg: catchLog.fish_weight_kg ?? '',
                caught_date: formatDateForDisplay(caughtAt),
                caught_time: formatTimeForDisplay(caughtAt),
                visibility: catchLog.visibility,
                latitude: catchLog.latitude ?? '',
                longitude: catchLog.longitude ?? '',
            };

            form.setData(nextValues);
            form.clearErrors();
        },
        [form],
    );

    const resetDialogState = useCallback(() => {
        setMapPickMode(false);
        setDialogStep('action');
        setSubmitError(null);
        setActiveCatch(null);
        setSuccessTitle('Fish added');
        setSuccessMessage('Your catch pin has been saved to Fishmap.');
    }, []);

    const openActionDialog = useCallback(
        (position?: [number, number] | null) => {
            if (successCloseTimer.current) {
                window.clearTimeout(successCloseTimer.current);
                successCloseTimer.current = null;
            }

            setActiveCatch(null);
            populateForm(null);

            if (position) {
                setCoordinates(position);
            } else if (!selectedPosition && currentTrackedPosition) {
                setCoordinates(currentTrackedPosition);
            }

            syncCurrentCatchTimestamp();
            resetDialogState();
            setDialogStep('action');
            setDialogOpen(true);
        },
        [currentTrackedPosition, populateForm, resetDialogState, selectedPosition, setCoordinates, syncCurrentCatchTimestamp],
    );

    const openEditDialog = useCallback(
        (catchLog: CatchLog) => {
            if (successCloseTimer.current) {
                window.clearTimeout(successCloseTimer.current);
                successCloseTimer.current = null;
            }

            setActiveCatch(catchLog);
            populateForm(catchLog);
            setSubmitError(null);
            setMapPickMode(false);
            setDialogStep('details');
            setDialogOpen(true);
        },
        [populateForm],
    );

    const openDeleteDialog = useCallback((catchLog: CatchLog) => {
        setActiveCatch(catchLog);
        setSubmitError(null);
        setMapPickMode(false);
        setDialogStep('delete');
        setDialogOpen(true);
    }, []);

    const useCurrentPositionForCatch = useCallback(() => {
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
                maximumAge: 10000,
                timeout: 15000,
            },
        );
    }, [setCoordinates]);

    const beginPickAnotherSpot = useCallback(() => {
        setDialogOpen(false);
        setMapPickMode(true);
    }, []);

    const continueToFishDetails = useCallback(() => {
        if (!activeCatch) {
            syncCurrentCatchTimestamp();
        }
        setDialogStep('details');
    }, [activeCatch, syncCurrentCatchTimestamp]);

    const saveFish = useCallback(() => {
        setSubmitError(null);

        if (!selectedPosition) {
            setSubmitError('Choose a catch location on the map before saving.');
            return;
        }

        if (!form.data.species.trim()) {
            setSubmitError('Please enter the fish species before saving.');
            return;
        }

        const caughtAt = buildCaughtAtIso(form.data.caught_date, form.data.caught_time);

        if (!caughtAt) {
            setSubmitError('Please use a valid date and time format: DD MM YYYY and 24h HH:mm.');
            return;
        }

        form.transform((data) => ({
            species: data.species,
            bait_used: data.bait_used || null,
            notes: data.notes || null,
            photo_url: data.photo_url || null,
            fish_length_cm: data.fish_length_cm || null,
            fish_weight_kg: data.fish_weight_kg || null,
            caught_at: caughtAt,
            latitude: data.latitude,
            longitude: data.longitude,
            visibility: data.visibility,
        }));

        const requestOptions = {
            preserveScroll: true,
            onError: (errors) => {
                setSubmitError(
                    errors.species ??
                        errors.bait_used ??
                        errors.notes ??
                        errors.photo_url ??
                        errors.fish_length_cm ??
                        errors.fish_weight_kg ??
                        errors.latitude ??
                        errors.longitude ??
                        errors.visibility ??
                        'We could not save this fish yet. Please check the fields and try again.',
                );
            },
            onSuccess: () => {
                const now = new Date();
                form.setData({
                    species: '',
                    bait_used: '',
                    notes: '',
                    photo_url: '',
                    fish_length_cm: '',
                    fish_weight_kg: '',
                    caught_date: formatDateForDisplay(now),
                    caught_time: formatTimeForDisplay(now),
                    visibility: 'private',
                    latitude: form.data.latitude,
                    longitude: form.data.longitude,
                });
                form.setData('caught_date', formatDateForDisplay(now));
                form.setData('caught_time', formatTimeForDisplay(now));
                form.setData('visibility', 'private');
                setSubmitError(null);
                setSuccessTitle(activeCatch ? 'Fish updated' : 'Fish added');
                setSuccessMessage(activeCatch ? 'Your catch pin has been updated.' : 'Your catch pin has been saved to Fishmap.');
                setDialogStep('success');
                successCloseTimer.current = window.setTimeout(() => {
                    setDialogOpen(false);
                    resetDialogState();
                    successCloseTimer.current = null;
                }, 1400);
            },
        };

        if (activeCatch) {
            form.put(route('catch-logs.update', activeCatch.id), requestOptions);
            return;
        }

        form.post(route('catch-logs.store'), requestOptions);
    }, [activeCatch, form, resetDialogState, selectedPosition]);

    const deleteFish = useCallback(() => {
        if (!activeCatch) {
            return;
        }

        setSubmitError(null);

        router.delete(route('catch-logs.destroy', activeCatch.id), {
            preserveScroll: true,
            onError: () => {
                setSubmitError('We could not delete this fish pin right now.');
            },
            onSuccess: () => {
                setSuccessTitle('Fish deleted');
                setSuccessMessage('The fish pin has been deleted.');
                setDialogStep('success');
                successCloseTimer.current = window.setTimeout(() => {
                    setDialogOpen(false);
                    resetDialogState();
                    successCloseTimer.current = null;
                }, 1400);
            },
        });
    }, [activeCatch, resetDialogState]);

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        saveFish();
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

                            if (mapPickMode) {
                                setMapPickMode(false);
                                setDialogStep('confirm-location');
                                setDialogOpen(true);
                            }
                        }}
                        onLongPress={(position) => {
                            openActionDialog(position);
                        }}
                        onCurrentPositionChange={(position) => {
                            setCurrentTrackedPosition(position);
                            if (!selectedPosition && position) {
                                setCoordinates(position);
                            }
                        }}
                        onInteractionChange={() => undefined}
                        recenterToCurrentSignal={recenterSignal}
                        onInitialLoadChange={setIsInitialMapLoading}
                        onEditCatch={openEditDialog}
                        onDeleteCatch={openDeleteDialog}
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
                                Hold on the map for 2 seconds to add a fish or start navigation later.
                            </p>
                        </div>

                        <div className="pointer-events-auto grid grid-cols-3 gap-3">
                            <StatCard icon={Fish} label="Catches" value={stats.total_catches.toString()} />
                            <StatCard icon={Globe} label="Public" value={stats.public_spots.toString()} />
                            <StatCard icon={Waves} label="Latest" value={latestTripLabel} compact />
                        </div>

                        {mapPickMode ? (
                            <StatusBanner type="info" message="Tap the map to choose where the fish was caught." />
                        ) : flash.success ? (
                            <StatusBanner type="info" message={flash.success} />
                        ) : null}
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
                                    useCurrentPositionForCatch();
                                }
                            }}
                        >
                            <Crosshair />
                        </Button>

                        <Button type="button" className="h-14 rounded-full px-5 shadow-lg" onClick={() => openActionDialog(selectedPosition)}>
                            <Plus className="size-4" />
                            Add fish
                        </Button>
                    </div>

                    <Dialog
                        open={dialogOpen}
                        onOpenChange={(open) => {
                            setDialogOpen(open);

                            if (!open) {
                                if (successCloseTimer.current) {
                                    window.clearTimeout(successCloseTimer.current);
                                    successCloseTimer.current = null;
                                }
                                resetDialogState();
                            }
                        }}
                    >
                        <DialogContent className="left-1/2 top-auto bottom-0 max-h-[85vh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 rounded-t-[1.75rem] rounded-b-none border-slate-200 p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem]">
                            <div className="relative p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />

                                {dialogStep === 'action' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">What do you want to do?</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">
                                                Use the current targeted map spot to start your next action.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 grid gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setDialogStep('location-mode')}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                            >
                                                <p className="font-semibold text-slate-950">Add a fish</p>
                                                <p className="mt-1 text-sm text-slate-600">Save a catch pin with species, size, time, and privacy.</p>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setDialogStep('navigation')}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300"
                                            >
                                                <p className="font-semibold text-slate-950">Start recording navigation</p>
                                                <p className="mt-1 text-sm text-slate-600">This will be added later as the route-tracking flow.</p>
                                            </button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'navigation' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">Navigation is coming later</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">
                                                We will build route recording after the add-fish flow is stable.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                            Fish catch logging is the current focus. Navigation recording will be the next major map feature.
                                        </div>

                                        <div className="mt-6 flex justify-end">
                                            <Button type="button" onClick={() => setDialogStep('action')}>
                                                Back
                                            </Button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'location-mode' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">Where was the fish caught?</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">
                                                You can use the targeted map location or pick another spot.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 grid gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setDialogStep('confirm-location')}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                            >
                                                <p className="font-semibold text-slate-950">Use targeted location</p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {selectedPosition
                                                        ? `${selectedPosition[0].toFixed(7)}, ${selectedPosition[1].toFixed(7)}`
                                                        : 'Use the location button first if you want your current position.'}
                                                </p>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={beginPickAnotherSpot}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300"
                                            >
                                                <p className="font-semibold text-slate-950">Pick another spot on the map</p>
                                                <p className="mt-1 text-sm text-slate-600">Close this modal and tap the map where the fish was actually caught.</p>
                                            </button>
                                        </div>

                                        <div className="mt-6 flex justify-between">
                                            <Button type="button" variant="outline" onClick={() => setDialogStep('action')}>
                                                Back
                                            </Button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'confirm-location' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">Confirm catch location</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">
                                                Make sure the pin is where the fish was actually caught.
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
                                                            : 'No spot selected yet.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex justify-between gap-3">
                                            <Button type="button" variant="outline" onClick={beginPickAnotherSpot}>
                                                No, choose again
                                            </Button>
                                            <Button type="button" disabled={!selectedPosition} onClick={continueToFishDetails}>
                                                Yes, continue
                                            </Button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'details' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">
                                                {activeCatch ? 'Edit fish details' : 'Add fish details'}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">
                                                Update any part of this catch pin, including the optional notes, bait, photo, and location.
                                            </DialogDescription>
                                        </DialogHeader>

                                        {submitError ? <StatusBanner type="warning" message={submitError} /> : null}

                                        <form onSubmit={submit} className="mt-6 grid gap-4">
                                            <Field label="Species" error={form.errors.species}>
                                                <input
                                                    value={form.data.species}
                                                    onChange={(event) => form.setData('species', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder="Sea bass"
                                                />
                                            </Field>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label="Bait used" error={form.errors.bait_used}>
                                                    <input
                                                        value={form.data.bait_used}
                                                        onChange={(event) => form.setData('bait_used', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="Soft lure"
                                                    />
                                                </Field>

                                                <Field label="Photo URL" error={form.errors.photo_url}>
                                                    <input
                                                        type="url"
                                                        value={form.data.photo_url}
                                                        onChange={(event) => form.setData('photo_url', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="https://..."
                                                    />
                                                </Field>
                                            </div>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label="Size (cm)" error={form.errors.fish_length_cm}>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={form.data.fish_length_cm}
                                                        onChange={(event) => form.setData('fish_length_cm', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="48.5"
                                                    />
                                                </Field>

                                                <Field label="Approx. weight (kg)" error={form.errors.fish_weight_kg}>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={form.data.fish_weight_kg}
                                                        onChange={(event) => form.setData('fish_weight_kg', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="1.80"
                                                    />
                                                </Field>
                                            </div>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label="Date (DD MM YYYY)">
                                                    <input
                                                        value={form.data.caught_date}
                                                        onChange={(event) => form.setData('caught_date', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="16 04 2026"
                                                    />
                                                </Field>

                                                <Field label="Time (24h)">
                                                    <input
                                                        value={form.data.caught_time}
                                                        onChange={(event) => form.setData('caught_time', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="14:30"
                                                    />
                                                </Field>
                                            </div>

                                            <Field label="Pin privacy">
                                                <select
                                                    value={form.data.visibility}
                                                    onChange={(event) => form.setData('visibility', event.target.value as 'private' | 'public')}
                                                    className={inputClassName}
                                                >
                                                    <option value="private">Private</option>
                                                    <option value="public">Public</option>
                                                </select>
                                            </Field>

                                            <Field label="Notes" error={form.errors.notes}>
                                                <textarea
                                                    value={form.data.notes}
                                                    onChange={(event) => form.setData('notes', event.target.value)}
                                                    className={`${inputClassName} min-h-28 resize-y`}
                                                    placeholder="Time of day, current, weather, or why this spot worked."
                                                />
                                            </Field>

                                            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                                {selectedPosition
                                                    ? `Pin location: ${selectedPosition[0].toFixed(7)}, ${selectedPosition[1].toFixed(7)}`
                                                    : 'No pin location selected yet.'}
                                            </div>

                                            <div className="flex items-center justify-between gap-3 border-t pt-4">
                                                <div className="flex gap-3">
                                                    <Button type="button" variant="outline" onClick={() => setDialogStep('confirm-location')}>
                                                        Change location
                                                    </Button>
                                                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                                        Cancel
                                                    </Button>
                                                </div>
                                                <Button type="button" disabled={form.processing || !selectedPosition} onClick={saveFish}>
                                                    {form.processing ? 'Saving...' : activeCatch ? 'Save changes' : 'Save fish'}
                                                </Button>
                                            </div>
                                        </form>
                                    </>
                                ) : null}

                                {dialogStep === 'delete' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">Delete fish pin?</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">
                                                This will remove the saved catch from your map history.
                                            </DialogDescription>
                                        </DialogHeader>

                                        {submitError ? <StatusBanner type="warning" message={submitError} /> : null}

                                        <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            {activeCatch ? `You are deleting ${activeCatch.species}. This cannot be undone.` : 'No catch selected.'}
                                        </div>

                                        <div className="mt-6 flex items-center justify-between gap-3">
                                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                                Cancel
                                            </Button>
                                            <Button type="button" variant="destructive" onClick={deleteFish}>
                                                Delete fish
                                            </Button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'success' ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center">
                                        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                            <CheckCircle2 className="size-8" />
                                        </div>
                                        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{successTitle}</h3>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                            {successMessage}
                                        </p>
                                    </div>
                                ) : null}

                                {dialogStep === 'details' && form.processing ? (
                                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[1.75rem] bg-white/92 text-center backdrop-blur">
                                        <div className="flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                                            <LoaderCircle className="size-8 animate-spin" />
                                        </div>
                                        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">Saving fish</h3>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                            Adding your catch pin to Fishmap now.
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                        </DialogContent>
                    </Dialog>
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

function formatDateForDisplay(date: Date) {
    const day = `${date.getDate()}`.padStart(2, '0');
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
}

function formatTimeForDisplay(date: Date) {
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');

    return `${hours}:${minutes}`;
}

function buildCaughtAtIso(dateValue: string, timeValue: string) {
    const dateParts = dateValue.trim().split(/\s+/);
    const timeParts = timeValue.trim().split(':');

    if (dateParts.length !== 3 || timeParts.length !== 2) {
        return null;
    }

    const [day, month, year] = dateParts;
    const [hours, minutes] = timeParts;
    const isoCandidate = `${year}-${month}-${day}T${hours}:${minutes}:00`;
    const parsed = new Date(isoCandidate);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
}

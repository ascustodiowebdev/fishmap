import { CatchMap } from '@/components/catch-map';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/lib/i18n';
import { type BreadcrumbItem, type CatchLog, type NavigationRoute, type SharedData } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { CheckCircle2, Crosshair, Fish, Globe, LoaderCircle, MapPinned, Plus, Waves } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface DashboardProps {
    catchLogs: CatchLog[];
    navigationRoutes: NavigationRoute[];
    stats: {
        total_catches: number;
        public_spots: number;
        latest_trip: string | null;
    };
}

type CatchFlowStep = 'action' | 'location-mode' | 'confirm-location' | 'details' | 'navigation' | 'delete' | 'success';
type RouteDialogMode = 'create' | 'edit' | 'delete' | null;

const inputClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100';

export default function Dashboard({ catchLogs, navigationRoutes, stats }: DashboardProps) {
    const { flash } = usePage<SharedData>().props;
    const { t } = useTranslator();
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Fishmap',
            href: '/dashboard',
        },
    ];
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogStep, setDialogStep] = useState<CatchFlowStep>('action');
    const [isInitialMapLoading, setIsInitialMapLoading] = useState(true);
    const [currentTrackedPosition, setCurrentTrackedPosition] = useState<[number, number] | null>(null);
    const [recenterSignal, setRecenterSignal] = useState(0);
    const [mapPickMode, setMapPickMode] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [activeCatch, setActiveCatch] = useState<CatchLog | null>(null);
    const [successTitle, setSuccessTitle] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const successCloseTimer = useRef<number | null>(null);
    const holdOpenTimer = useRef<number | null>(null);
    const [isRecordingRoute, setIsRecordingRoute] = useState(false);
    const [routeSimulationEnabled, setRouteSimulationEnabled] = useState(false);
    const [routeSimulationPickMode, setRouteSimulationPickMode] = useState(false);
    const [recordingVisibility, setRecordingVisibility] = useState<'private' | 'public'>('private');
    const [recordingStartedAt, setRecordingStartedAt] = useState<string | null>(null);
    const [activeRoutePoints, setActiveRoutePoints] = useState<Array<{ latitude: number; longitude: number; recorded_at: string }>>([]);
    const [simulatedPosition, setSimulatedPosition] = useState<[number, number] | null>(null);
    const simulationStep = useRef(0);
    const [routeDialogOpen, setRouteDialogOpen] = useState(false);
    const [routeDialogMode, setRouteDialogMode] = useState<RouteDialogMode>(null);
    const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
    const [routeSubmitError, setRouteSubmitError] = useState<string | null>(null);

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

    const routeForm = useForm({
        name: '',
        visibility: 'private' as 'private' | 'public',
        started_date: formatDateForDisplay(new Date()),
        started_time: formatTimeForDisplay(new Date()),
        ended_date: formatDateForDisplay(new Date()),
        ended_time: formatTimeForDisplay(new Date()),
    });

    const selectedPosition = useMemo<[number, number] | null>(() => {
        const latitude = Number(form.data.latitude);
        const longitude = Number(form.data.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        return [latitude, longitude];
    }, [form.data.latitude, form.data.longitude]);

    const displayTrackedPosition = routeSimulationEnabled && simulatedPosition ? simulatedPosition : currentTrackedPosition;
    const activeRoutePolyline = activeRoutePoints.map((point) => [point.latitude, point.longitude] as [number, number]);

    useEffect(() => {
        if (!routeSimulationEnabled && !isRecordingRoute) {
            setSimulatedPosition(null);
            setRouteSimulationPickMode(false);
        }
    }, [isRecordingRoute, routeSimulationEnabled]);

    useEffect(() => {
        if (!routeSimulationEnabled || !isRecordingRoute) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName?.toLowerCase();

            if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) {
                return;
            }

            const key = event.key.toLowerCase();
            const step = 0.00018;
            const delta =
                key === 'w'
                    ? [step, 0]
                    : key === 's'
                      ? [-step, 0]
                      : key === 'a'
                        ? [0, -step]
                        : key === 'd'
                          ? [0, step]
                          : null;

            if (!delta) {
                return;
            }

            event.preventDefault();

            setSimulatedPosition((current) => {
                const base = current ?? currentTrackedPosition ?? [38.7223, -9.1393];
                const nextPosition: [number, number] = [base[0] + delta[0], base[1] + delta[1]];

                setActiveRoutePoints((currentPoints) => [
                    ...currentPoints,
                    {
                        latitude: nextPosition[0],
                        longitude: nextPosition[1],
                        recorded_at: new Date().toISOString(),
                    },
                ]);

                return nextPosition;
            });
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentTrackedPosition, isRecordingRoute, routeSimulationEnabled]);

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

    const populateRouteForm = useCallback(
        (route?: NavigationRoute | null, fallbackStartedAt?: string | null, fallbackEndedAt?: string | null) => {
            const startedAt = route?.started_at ? new Date(route.started_at) : fallbackStartedAt ? new Date(fallbackStartedAt) : new Date();
            const endedAt = route?.ended_at ? new Date(route.ended_at) : fallbackEndedAt ? new Date(fallbackEndedAt) : new Date();

            routeForm.setData({
                name: route?.name ?? '',
                visibility: route?.visibility ?? recordingVisibility,
                started_date: formatDateForDisplay(startedAt),
                started_time: formatTimeForDisplay(startedAt),
                ended_date: formatDateForDisplay(endedAt),
                ended_time: formatTimeForDisplay(endedAt),
            });
            routeForm.clearErrors();
        },
        [recordingVisibility, routeForm],
    );

    useEffect(() => {
        if (!isRecordingRoute) {
            return;
        }

        const intervalId = window.setInterval(() => {
            const now = new Date();

            if (routeSimulationEnabled) {
                return;
            }

            if (!currentTrackedPosition) {
                return;
            }

            setActiveRoutePoints((current) => [
                ...current,
                {
                    latitude: currentTrackedPosition[0],
                    longitude: currentTrackedPosition[1],
                    recorded_at: now.toISOString(),
                },
            ]);
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [currentTrackedPosition, isRecordingRoute, routeSimulationEnabled]);

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
        setSuccessTitle(t('dashboard.fish_added'));
        setSuccessMessage(t('dashboard.saved_copy'));
    }, [t]);

    const openActionDialog = useCallback(
        (position?: [number, number] | null) => {
            if (successCloseTimer.current) {
                window.clearTimeout(successCloseTimer.current);
                successCloseTimer.current = null;
            }
            if (holdOpenTimer.current) {
                window.clearTimeout(holdOpenTimer.current);
                holdOpenTimer.current = null;
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

    const startRouteRecording = useCallback(
        (forcedStartPosition?: [number, number] | null) => {
            const startPosition = forcedStartPosition ?? (routeSimulationEnabled ? simulatedPosition ?? currentTrackedPosition ?? [38.7223, -9.1393] : currentTrackedPosition);

            if (!startPosition) {
                setSubmitError(t('dashboard.route_need_position'));
                setDialogOpen(false);
                return;
            }

            const startedAt = new Date().toISOString();

            setActiveRoutePoints([
                {
                    latitude: startPosition[0],
                    longitude: startPosition[1],
                    recorded_at: startedAt,
                },
            ]);
            setRecordingStartedAt(startedAt);
            setIsRecordingRoute(true);
            setRouteSimulationPickMode(false);
            setRouteDialogOpen(false);
            setRouteDialogMode(null);
            setDialogOpen(false);
            setDialogStep('action');
            setSubmitError(null);
            setRouteSubmitError(null);
            setActiveRoute(null);

            if (routeSimulationEnabled) {
                simulationStep.current = 0;
                setSimulatedPosition(startPosition);
            }
        },
        [currentTrackedPosition, routeSimulationEnabled, simulatedPosition, t],
    );

    const stopRouteRecording = useCallback(() => {
        if (!isRecordingRoute || activeRoutePoints.length < 2 || !recordingStartedAt) {
            setIsRecordingRoute(false);
            setActiveRoutePoints([]);
            setRecordingStartedAt(null);
            setRouteSimulationPickMode(false);
            return;
        }

        const endedAt = new Date().toISOString();

        setIsRecordingRoute(false);
        setRouteDialogMode('create');
        setRouteDialogOpen(true);
        setRouteSubmitError(null);
        setActiveRoute(null);
        populateRouteForm(null, recordingStartedAt, endedAt);
    }, [activeRoutePoints.length, isRecordingRoute, populateRouteForm, recordingStartedAt]);

    const openRouteEditDialog = useCallback(
        (navigationRoute: NavigationRoute) => {
            setActiveRoute(navigationRoute);
            setRouteDialogMode('edit');
            setRouteDialogOpen(true);
            setRouteSubmitError(null);
            populateRouteForm(navigationRoute);
        },
        [populateRouteForm],
    );

    const openRouteDeleteDialog = useCallback((navigationRoute: NavigationRoute) => {
        setActiveRoute(navigationRoute);
        setRouteDialogMode('delete');
        setRouteDialogOpen(true);
        setRouteSubmitError(null);
    }, []);

    const resetRouteDraft = useCallback(() => {
        setActiveRoutePoints([]);
        setRecordingStartedAt(null);
        setRouteDialogMode(null);
        setActiveRoute(null);
        setRouteSubmitError(null);
        if (!routeSimulationEnabled) {
            setSimulatedPosition(null);
        }
    }, [routeSimulationEnabled]);

    const saveRoute = useCallback(() => {
        setRouteSubmitError(null);

        const startedAt = buildCaughtAtIso(routeForm.data.started_date, routeForm.data.started_time);
        const endedAt = buildCaughtAtIso(routeForm.data.ended_date, routeForm.data.ended_time);

        if (!startedAt || !endedAt) {
            setRouteSubmitError('Please use a valid date and time format: DD MM YYYY and 24h HH:mm.');
            return;
        }

        if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
            setRouteSubmitError('The route end time cannot be earlier than the start time.');
            return;
        }

        const payload = {
            name: routeForm.data.name || null,
            visibility: routeForm.data.visibility,
            started_at: startedAt,
            ended_at: endedAt,
        };

        if (routeDialogMode === 'edit' && activeRoute) {
            router.put(route('navigation-routes.update', activeRoute.id), payload, {
                preserveScroll: true,
                onError: (errors) => {
                    setRouteSubmitError(
                        errors.name ??
                            errors.visibility ??
                            errors.started_at ??
                            errors.ended_at ??
                            'We could not update this route right now.',
                    );
                },
                onSuccess: () => {
                    setRouteDialogOpen(false);
                    setRouteDialogMode(null);
                    setActiveRoute(null);
                },
            });
            return;
        }

        if (activeRoutePoints.length < 2) {
            setRouteSubmitError('A route needs at least two points before it can be saved.');
            return;
        }

        router.post(
            route('navigation-routes.store'),
            {
                ...payload,
                points: activeRoutePoints,
            },
            {
                preserveScroll: true,
                onError: (errors) => {
                    setRouteSubmitError(
                        errors.name ??
                            errors.visibility ??
                            errors.started_at ??
                            errors.ended_at ??
                            errors.points ??
                            'We could not save this route right now.',
                    );
                },
                onSuccess: () => {
                    setRouteDialogOpen(false);
                    resetRouteDraft();
                    simulationStep.current = 0;
                    setRouteSimulationPickMode(false);
                },
            },
        );
    }, [activeRoute, activeRoutePoints, resetRouteDraft, routeDialogMode, routeForm.data.ended_date, routeForm.data.ended_time, routeForm.data.name, routeForm.data.started_date, routeForm.data.started_time, routeForm.data.visibility]);

    const deleteRoute = useCallback(() => {
        if (!activeRoute) {
            return;
        }

        router.delete(route('navigation-routes.destroy', activeRoute.id), {
            preserveScroll: true,
            onError: () => {
                setRouteSubmitError('We could not delete this route right now.');
            },
            onSuccess: () => {
                setRouteDialogOpen(false);
                setRouteDialogMode(null);
                setActiveRoute(null);
            },
        });
    }, [activeRoute]);

    const beginPickAnotherSpot = useCallback(() => {
        if (holdOpenTimer.current) {
            window.clearTimeout(holdOpenTimer.current);
            holdOpenTimer.current = null;
        }
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
                setSuccessTitle(activeCatch ? t('dashboard.fish_updated') : t('dashboard.fish_added'));
                setSuccessMessage(activeCatch ? t('dashboard.updated_copy') : t('dashboard.saved_copy'));
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
                setSuccessTitle(t('dashboard.fish_deleted'));
                setSuccessMessage(t('dashboard.deleted_copy'));
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

    const latestTripLabel = stats.latest_trip ? new Date(stats.latest_trip).toLocaleDateString() : t('dashboard.no_trips');

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
                        navigationRoutes={navigationRoutes}
                        activeRoutePoints={activeRoutePolyline}
                        positionOverride={displayTrackedPosition}
                        selectedPosition={selectedPosition}
                        allowTapSelection={mapPickMode || routeSimulationPickMode}
                        onSelectPosition={(position) => {
                            if (routeSimulationPickMode) {
                                setSimulatedPosition(position);
                                startRouteRecording(position);
                                return;
                            }

                            setCoordinates(position);

                            if (mapPickMode) {
                                setMapPickMode(false);
                                setDialogStep('confirm-location');
                                setDialogOpen(true);
                            }
                        }}
                        onClearSelection={() => {
                            form.setData('latitude', '');
                            form.setData('longitude', '');
                        }}
                        onLongPress={(position) => {
                            setCoordinates(position);

                            if (holdOpenTimer.current) {
                                window.clearTimeout(holdOpenTimer.current);
                            }
                            holdOpenTimer.current = window.setTimeout(() => {
                                openActionDialog(position);
                                holdOpenTimer.current = null;
                            }, 120);
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
                        onEditRoute={openRouteEditDialog}
                        onDeleteRoute={openRouteDeleteDialog}
                    />

                    <div
                        className={`pointer-events-none absolute inset-x-4 top-4 z-[520] flex flex-col gap-3 transition-opacity duration-200 md:left-4 md:right-auto md:w-[360px] ${
                            isInitialMapLoading ? 'opacity-0' : 'opacity-100'
                        }`}
                    >
                        <div className="pointer-events-auto rounded-[1.5rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                            <p className="text-xs font-semibold tracking-[0.22em] text-teal-800 uppercase">Fishmap</p>
                            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{t('dashboard.live_map')}</h1>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{t('dashboard.hold_map')}</p>
                        </div>

                        <div className="pointer-events-auto grid grid-cols-3 gap-3">
                            <StatCard icon={Fish} label={t('dashboard.total_catches')} value={stats.total_catches.toString()} />
                            <StatCard icon={Globe} label={t('dashboard.public')} value={stats.public_spots.toString()} />
                            <StatCard icon={Waves} label={t('dashboard.latest')} value={latestTripLabel} compact />
                        </div>

                        <div className="pointer-events-auto rounded-[1.35rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-950">{t('dashboard.route_recording')}</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                        {isRecordingRoute
                                            ? t('dashboard.route_recording_live', { count: activeRoutePoints.length })
                                            : routeSimulationPickMode
                                              ? t('dashboard.simulation_pick_start')
                                              : t('dashboard.route_recording_idle')}
                                    </p>
                                    {routeSimulationPickMode ? (
                                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-teal-700">
                                            {t('dashboard.simulation_pick_start')}
                                        </p>
                                    ) : null}
                                </div>
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={routeSimulationEnabled}
                                        onChange={(event) => {
                                            const checked = event.target.checked;
                                            setRouteSimulationEnabled(checked);
                                            setRouteSimulationPickMode(checked);

                                            if (!checked) {
                                                setSimulatedPosition(null);
                                            }
                                        }}
                                    />
                                    {t('dashboard.simulation')}
                                </label>
                            </div>

                            <div className="mt-4 flex items-center gap-3">
                                <select
                                    value={recordingVisibility}
                                    onChange={(event) => setRecordingVisibility(event.target.value as 'private' | 'public')}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                                >
                                    <option value="private">{t('dashboard.private_route')}</option>
                                    <option value="public">{t('dashboard.public_route')}</option>
                                </select>

                                {isRecordingRoute ? (
                                    <Button type="button" variant="destructive" onClick={stopRouteRecording}>
                                        {t('dashboard.stop_recording')}
                                    </Button>
                                ) : (
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (routeSimulationEnabled) {
                                                setRouteSimulationPickMode(true);
                                                return;
                                            }

                                            startRouteRecording();
                                        }}
                                    >
                                        {t('dashboard.start_recording')}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {mapPickMode ? (
                            <StatusBanner type="info" message={t('dashboard.tap_to_choose')} />
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
                                if (displayTrackedPosition) {
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
                            {t('dashboard.add_fish')}
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
                                if (holdOpenTimer.current) {
                                    window.clearTimeout(holdOpenTimer.current);
                                    holdOpenTimer.current = null;
                                }
                                resetDialogState();
                            }
                        }}
                    >
                        <DialogContent
                            onInteractOutside={(event) => event.preventDefault()}
                            onPointerDownOutside={(event) => event.preventDefault()}
                            className="left-1/2 top-auto bottom-0 max-h-[85vh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 rounded-t-[1.75rem] rounded-b-none border-slate-200 p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem]"
                        >
                            <div className="relative p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />

                                {dialogStep === 'action' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">{t('dashboard.what_do')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">{t('dashboard.what_do_copy')}</DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 grid gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setDialogStep('location-mode')}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                            >
                                                <p className="font-semibold text-slate-950">{t('dashboard.add_a_fish')}</p>
                                                <p className="mt-1 text-sm text-slate-600">{t('dashboard.add_a_fish_copy')}</p>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (routeSimulationEnabled) {
                                                        setRouteSimulationPickMode(true);
                                                        setDialogOpen(false);
                                                        return;
                                                    }

                                                    startRouteRecording();
                                                }}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300"
                                            >
                                                <p className="font-semibold text-slate-950">{t('dashboard.start_navigation')}</p>
                                                <p className="mt-1 text-sm text-slate-600">{t('dashboard.start_navigation_copy')}</p>
                                            </button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'navigation' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">{t('dashboard.navigation_later')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">{t('dashboard.navigation_later_copy')}</DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                            {t('dashboard.navigation_focus')}
                                        </div>

                                        <div className="mt-6 flex justify-end">
                                            <Button type="button" onClick={() => setDialogStep('action')}>
                                                {t('dashboard.back')}
                                            </Button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'location-mode' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">{t('dashboard.where_caught')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">{t('dashboard.where_caught_copy')}</DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 grid gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setDialogStep('confirm-location')}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                            >
                                                <p className="font-semibold text-slate-950">{t('dashboard.use_targeted')}</p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {selectedPosition
                                                        ? `${selectedPosition[0].toFixed(7)}, ${selectedPosition[1].toFixed(7)}`
                                                        : t('dashboard.use_location_hint')}
                                                </p>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={beginPickAnotherSpot}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300"
                                            >
                                                <p className="font-semibold text-slate-950">{t('dashboard.pick_other')}</p>
                                                <p className="mt-1 text-sm text-slate-600">{t('dashboard.pick_other_copy')}</p>
                                            </button>
                                        </div>

                                        <div className="mt-6 flex justify-between">
                                            <Button type="button" variant="outline" onClick={() => setDialogStep('action')}>
                                                {t('dashboard.back')}
                                            </Button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'confirm-location' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">{t('dashboard.confirm_location')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">{t('dashboard.confirm_location_copy')}</DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            <div className="flex items-start gap-3">
                                                <MapPinned className="mt-0.5 size-4 text-teal-700" />
                                                <div>
                                                    <p className="font-medium text-slate-900">{t('dashboard.selected_spot')}</p>
                                                    <p className="mt-1">
                                                        {selectedPosition
                                                            ? `${selectedPosition[0].toFixed(7)}, ${selectedPosition[1].toFixed(7)}`
                                                            : t('dashboard.no_spot')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex justify-between gap-3">
                                            <Button type="button" variant="outline" onClick={beginPickAnotherSpot}>
                                                {t('dashboard.choose_again')}
                                            </Button>
                                            <Button type="button" disabled={!selectedPosition} onClick={continueToFishDetails}>
                                                {t('dashboard.continue')}
                                            </Button>
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'details' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">
                                                {activeCatch ? t('dashboard.edit_details') : t('dashboard.add_details')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">{t('dashboard.details_copy')}</DialogDescription>
                                        </DialogHeader>

                                        {submitError ? <StatusBanner type="warning" message={submitError} /> : null}

                                        <form onSubmit={submit} className="mt-6 grid gap-4">
                                            <Field label={t('dashboard.species')} error={form.errors.species}>
                                                <input
                                                    value={form.data.species}
                                                    onChange={(event) => form.setData('species', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder="Sea bass"
                                                />
                                            </Field>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label={t('dashboard.bait_used')} error={form.errors.bait_used}>
                                                    <input
                                                        value={form.data.bait_used}
                                                        onChange={(event) => form.setData('bait_used', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="Soft lure"
                                                    />
                                                </Field>

                                                <Field label={t('dashboard.photo_url')} error={form.errors.photo_url}>
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
                                                <Field label={t('dashboard.size_cm')} error={form.errors.fish_length_cm}>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={form.data.fish_length_cm}
                                                        onChange={(event) => form.setData('fish_length_cm', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="48.5"
                                                    />
                                                </Field>

                                                <Field label={t('dashboard.weight_kg')} error={form.errors.fish_weight_kg}>
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
                                                <Field label={t('dashboard.date')}>
                                                    <input
                                                        value={form.data.caught_date}
                                                        onChange={(event) => form.setData('caught_date', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="16 04 2026"
                                                    />
                                                </Field>

                                                <Field label={t('dashboard.time')}>
                                                    <input
                                                        value={form.data.caught_time}
                                                        onChange={(event) => form.setData('caught_time', event.target.value)}
                                                        className={inputClassName}
                                                        placeholder="14:30"
                                                    />
                                                </Field>
                                            </div>

                                            <Field label={t('dashboard.privacy')}>
                                                <select
                                                    value={form.data.visibility}
                                                    onChange={(event) => form.setData('visibility', event.target.value as 'private' | 'public')}
                                                    className={inputClassName}
                                                >
                                                    <option value="private">{t('dashboard.private')}</option>
                                                    <option value="public">{t('dashboard.public_option')}</option>
                                                </select>
                                            </Field>

                                            <Field label={t('dashboard.notes')} error={form.errors.notes}>
                                                <textarea
                                                    value={form.data.notes}
                                                    onChange={(event) => form.setData('notes', event.target.value)}
                                                    className={`${inputClassName} min-h-28 resize-y`}
                                                    placeholder="Time of day, current, weather, or why this spot worked."
                                                />
                                            </Field>

                                            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                                {selectedPosition
                                                    ? t('dashboard.pin_location', {
                                                          lat: selectedPosition[0].toFixed(7),
                                                          lng: selectedPosition[1].toFixed(7),
                                                      })
                                                    : t('dashboard.no_pin_location')}
                                            </div>

                                            <div className="flex items-center justify-between gap-3 border-t pt-4">
                                                <div className="flex gap-3">
                                                    <Button type="button" variant="outline" onClick={() => setDialogStep('confirm-location')}>
                                                        {t('dashboard.change_location')}
                                                    </Button>
                                                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                                        {t('common.cancel')}
                                                    </Button>
                                                </div>
                                                <Button type="button" disabled={form.processing || !selectedPosition} onClick={saveFish}>
                                                    {form.processing ? t('common.saving') : activeCatch ? t('dashboard.save_changes') : t('dashboard.save_fish')}
                                                </Button>
                                            </div>
                                        </form>
                                    </>
                                ) : null}

                                {dialogStep === 'delete' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">{t('dashboard.delete_pin')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">{t('dashboard.delete_pin_copy')}</DialogDescription>
                                        </DialogHeader>

                                        {submitError ? <StatusBanner type="warning" message={submitError} /> : null}

                                        <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            {activeCatch ? t('dashboard.delete_selected', { species: activeCatch.species }) : t('dashboard.no_spot')}
                                        </div>

                                        <div className="mt-6 flex items-center justify-between gap-3">
                                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                                {t('common.cancel')}
                                            </Button>
                                            <Button type="button" variant="destructive" onClick={deleteFish}>
                                                {t('dashboard.delete_fish')}
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
                                        <p className="mt-2 text-sm leading-6 text-slate-600">{successMessage}</p>
                                    </div>
                                ) : null}

                                {dialogStep === 'details' && form.processing ? (
                                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[1.75rem] bg-white/92 text-center backdrop-blur">
                                        <div className="flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                                            <LoaderCircle className="size-8 animate-spin" />
                                        </div>
                                        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{t('dashboard.saving_fish')}</h3>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">{t('dashboard.saving_fish_copy')}</p>
                                    </div>
                                ) : null}
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={routeDialogOpen}
                        onOpenChange={(open) => {
                            setRouteDialogOpen(open);

                            if (!open) {
                                if (routeDialogMode === 'create') {
                                    resetRouteDraft();
                                } else {
                                    setRouteDialogMode(null);
                                    setActiveRoute(null);
                                    setRouteSubmitError(null);
                                }
                            }
                        }}
                    >
                        <DialogContent className="left-1/2 top-auto bottom-0 max-h-[85vh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 rounded-t-[1.75rem] rounded-b-none border-slate-200 p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem]">
                            <div className="relative p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />

                                {routeDialogMode === 'create' || routeDialogMode === 'edit' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">
                                                {routeDialogMode === 'create' ? t('dashboard.save_route') : t('dashboard.edit_route')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">
                                                {routeDialogMode === 'create' ? t('dashboard.save_route_copy') : t('dashboard.edit_route_copy')}
                                            </DialogDescription>
                                        </DialogHeader>

                                        {routeSubmitError ? <StatusBanner type="warning" message={routeSubmitError} /> : null}

                                        <div className="mt-6 grid gap-4">
                                            <Field label={t('dashboard.route_name')}>
                                                <input
                                                    value={routeForm.data.name}
                                                    onChange={(event) => routeForm.setData('name', event.target.value)}
                                                    className={inputClassName}
                                                    placeholder={t('dashboard.route_name_placeholder')}
                                                />
                                            </Field>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label={t('dashboard.date')}>
                                                    <input
                                                        value={routeForm.data.started_date}
                                                        onChange={(event) => routeForm.setData('started_date', event.target.value)}
                                                        className={inputClassName}
                                                    />
                                                </Field>

                                                <Field label={t('dashboard.time')}>
                                                    <input
                                                        value={routeForm.data.started_time}
                                                        onChange={(event) => routeForm.setData('started_time', event.target.value)}
                                                        className={inputClassName}
                                                    />
                                                </Field>
                                            </div>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label={t('dashboard.end_date')}>
                                                    <input
                                                        value={routeForm.data.ended_date}
                                                        onChange={(event) => routeForm.setData('ended_date', event.target.value)}
                                                        className={inputClassName}
                                                    />
                                                </Field>

                                                <Field label={t('dashboard.end_time')}>
                                                    <input
                                                        value={routeForm.data.ended_time}
                                                        onChange={(event) => routeForm.setData('ended_time', event.target.value)}
                                                        className={inputClassName}
                                                    />
                                                </Field>
                                            </div>

                                            <Field label={t('dashboard.privacy')}>
                                                <select
                                                    value={routeForm.data.visibility}
                                                    onChange={(event) => routeForm.setData('visibility', event.target.value as 'private' | 'public')}
                                                    className={inputClassName}
                                                >
                                                    <option value="private">{t('dashboard.private_route')}</option>
                                                    <option value="public">{t('dashboard.public_route')}</option>
                                                </select>
                                            </Field>

                                            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                                {t('dashboard.route_points', {
                                                    count: routeDialogMode === 'create' ? activeRoutePoints.length : activeRoute?.point_count ?? 0,
                                                })}
                                            </div>

                                            <div className="flex items-center justify-between gap-3 border-t pt-4">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setRouteDialogOpen(false);
                                                        if (routeDialogMode === 'create') {
                                                            resetRouteDraft();
                                                        }
                                                    }}
                                                >
                                                    {t('common.cancel')}
                                                </Button>
                                                <Button type="button" onClick={saveRoute}>
                                                    {routeDialogMode === 'create' ? t('dashboard.save_route_button') : t('dashboard.save_changes')}
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                ) : null}

                                {routeDialogMode === 'delete' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950">{t('dashboard.delete_route')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600">{t('dashboard.delete_route_copy')}</DialogDescription>
                                        </DialogHeader>

                                        {routeSubmitError ? <StatusBanner type="warning" message={routeSubmitError} /> : null}

                                        <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            {activeRoute ? t('dashboard.delete_route_selected', { name: activeRoute.name }) : t('dashboard.no_trips')}
                                        </div>

                                        <div className="mt-6 flex items-center justify-between gap-3">
                                            <Button type="button" variant="outline" onClick={() => setRouteDialogOpen(false)}>
                                                {t('common.cancel')}
                                            </Button>
                                            <Button type="button" variant="destructive" onClick={deleteRoute}>
                                                {t('dashboard.delete_route_button')}
                                            </Button>
                                        </div>
                                    </>
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

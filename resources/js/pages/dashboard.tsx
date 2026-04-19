import { CatchMap } from '@/components/catch-map';
import AppWordmark from '@/components/app-wordmark';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/lib/i18n';
import { type BreadcrumbItem, type CatchLog, type MapFocusRequest, type NavigationRoute, type SharedData } from '@/types';
import AppLayout from '@/layouts/app-layout';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowUp, CheckCircle2, Crosshair, Fish, Globe, LoaderCircle, MapPinned, Menu, Plus, Route as RouteIcon, Waves, X } from 'lucide-react';
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
type LibraryDialogMode = 'spots' | 'routes' | null;

interface RouteGuidanceMetrics {
    nearestPoint: [number, number];
    offCourseMeters: number;
    rejoinBearing: number;
    onCourse: boolean;
}

const inputClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400 dark:focus:ring-teal-900/40';

export default function Dashboard({ catchLogs, navigationRoutes, stats }: DashboardProps) {
    const { flash, auth } = usePage<SharedData>().props;
    const { t } = useTranslator();
    const canRecordRoutes = Boolean(auth.user?.is_admin);
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Fishmap',
            href: '/map',
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
    const [recordingVisibility, setRecordingVisibility] = useState<'private' | 'public'>('private');
    const [recordingStartedAt, setRecordingStartedAt] = useState<string | null>(null);
    const [activeRoutePoints, setActiveRoutePoints] = useState<Array<{ latitude: number; longitude: number; recorded_at: string }>>([]);
    const [simulatedPosition, setSimulatedPosition] = useState<[number, number] | null>(null);
    const [routeDialogOpen, setRouteDialogOpen] = useState(false);
    const [routeDialogMode, setRouteDialogMode] = useState<RouteDialogMode>(null);
    const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
    const [routeSubmitError, setRouteSubmitError] = useState<string | null>(null);
    const [mobileHudOpen, setMobileHudOpen] = useState(false);
    const [mapFocusRequest, setMapFocusRequest] = useState<MapFocusRequest | null>(null);
    const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
    const [libraryDialogMode, setLibraryDialogMode] = useState<LibraryDialogMode>(null);
    const [guidedRouteId, setGuidedRouteId] = useState<number | null>(null);
    const [pendingGuidanceRoute, setPendingGuidanceRoute] = useState<NavigationRoute | null>(null);
    const [guidanceConfirmOpen, setGuidanceConfirmOpen] = useState(false);
    const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number | null>(null);
    const [gpsSpeedKmh, setGpsSpeedKmh] = useState<number | null>(null);
    const lastMovementSample = useRef<{ position: [number, number]; timestamp: number } | null>(null);

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

    const privateFishSpots = useMemo(
        () => catchLogs.filter((catchLog) => catchLog.is_owner && catchLog.visibility === 'private'),
        [catchLogs],
    );

    const publicFishSpots = useMemo(
        () => catchLogs.filter((catchLog) => catchLog.visibility === 'public'),
        [catchLogs],
    );

    const guidedRoute = useMemo(
        () => navigationRoutes.find((navigationRoute) => navigationRoute.id === guidedRouteId) ?? null,
        [guidedRouteId, navigationRoutes],
    );

    const guidancePosition = routeSimulationEnabled && simulatedPosition ? simulatedPosition : currentTrackedPosition;

    const guidanceMetrics = useMemo<RouteGuidanceMetrics | null>(() => {
        if (!guidedRoute || !guidancePosition) {
            return null;
        }

        return computeRouteGuidance(guidancePosition, guidedRoute);
    }, [guidancePosition, guidedRoute]);

    const isGuidanceActive = Boolean(guidedRoute);
    const displayedSpeedKmh = routeSimulationEnabled ? currentSpeedKmh : gpsSpeedKmh ?? currentSpeedKmh;

    useEffect(() => {
        if (!routeSimulationEnabled && !isRecordingRoute) {
            setSimulatedPosition(null);
        }
    }, [isRecordingRoute, routeSimulationEnabled]);

    useEffect(() => {
        if (guidedRouteId && !guidedRoute) {
            setGuidedRouteId(null);
        }
    }, [guidedRoute, guidedRouteId]);

    useEffect(() => {
        if (dialogOpen || routeDialogOpen) {
            setMobileHudOpen(false);
        }
    }, [dialogOpen, routeDialogOpen]);

    useEffect(() => {
        if (!displayTrackedPosition) {
            lastMovementSample.current = null;
            setCurrentSpeedKmh(null);
            return;
        }

        const now = Date.now();
        const previousSample = lastMovementSample.current;

        if (!previousSample) {
            lastMovementSample.current = { position: displayTrackedPosition, timestamp: now };
            setCurrentSpeedKmh(0);
            return;
        }

        const elapsedMilliseconds = now - previousSample.timestamp;

        if (elapsedMilliseconds <= 0) {
            return;
        }

        const distanceMeters = calculateDistanceMeters(previousSample.position, displayTrackedPosition);
        const nextSpeedKmh = distanceMeters < 1 ? 0 : (distanceMeters / elapsedMilliseconds) * 3600;

        setCurrentSpeedKmh(nextSpeedKmh);
        lastMovementSample.current = { position: displayTrackedPosition, timestamp: now };
    }, [displayTrackedPosition]);

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

    const fetchCurrentPositionForCatch = useCallback(() => {
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

    const focusCatchSpot = useCallback((catchLog: CatchLog) => {
        const latitude = Number(catchLog.latitude);
        const longitude = Number(catchLog.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        setMobileHudOpen(false);
        setLibraryDialogOpen(false);
        setMapFocusRequest({
            key: Date.now(),
            center: [latitude, longitude],
        });
    }, []);

    const focusNavigationRoute = useCallback((navigationRoute: NavigationRoute) => {
        const routePoints = navigationRoute.points
            .map((point) => [Number(point.latitude), Number(point.longitude)] as [number, number])
            .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));

        if (routePoints.length === 0) {
            return;
        }

        const latitudes = routePoints.map(([latitude]) => latitude);
        const longitudes = routePoints.map(([, longitude]) => longitude);

        setMobileHudOpen(false);
        setLibraryDialogOpen(false);
        setMapFocusRequest({
            key: Date.now(),
            bounds: [
                [Math.min(...latitudes), Math.min(...longitudes)],
                [Math.max(...latitudes), Math.max(...longitudes)],
            ],
        });
    }, []);

    const openLibraryDialog = useCallback((mode: LibraryDialogMode) => {
        setLibraryDialogMode(mode);
        setLibraryDialogOpen(true);
    }, []);

    const requestRouteGuidance = useCallback((navigationRoute: NavigationRoute) => {
        setPendingGuidanceRoute(navigationRoute);
        setGuidanceConfirmOpen(true);
        setLibraryDialogOpen(false);
        setLibraryDialogMode(null);
        setMobileHudOpen(false);
    }, []);

    const startRouteGuidance = useCallback(
        (navigationRoute: NavigationRoute) => {
            setGuidedRouteId(navigationRoute.id);
            focusNavigationRoute(navigationRoute);
            setPendingGuidanceRoute(null);
            setGuidanceConfirmOpen(false);
        },
        [focusNavigationRoute],
    );

    const stopRouteGuidance = useCallback(() => {
        setGuidedRouteId(null);
        setPendingGuidanceRoute(null);
        setGuidanceConfirmOpen(false);
    }, []);

    const startRouteRecording = useCallback(
        (forcedStartPosition?: [number, number] | null) => {
            if (!canRecordRoutes) {
                return;
            }

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
            setRouteDialogOpen(false);
            setRouteDialogMode(null);
            setDialogOpen(false);
            setDialogStep('action');
            setSubmitError(null);
            setRouteSubmitError(null);
            setActiveRoute(null);

            if (routeSimulationEnabled) {
                setSimulatedPosition(startPosition);
            }
        },
        [canRecordRoutes, currentTrackedPosition, routeSimulationEnabled, simulatedPosition, t],
    );

    const stopRouteRecording = useCallback(() => {
        if (!canRecordRoutes) {
            return;
        }

        if (!isRecordingRoute || activeRoutePoints.length < 2 || !recordingStartedAt) {
            setIsRecordingRoute(false);
            setActiveRoutePoints([]);
            setRecordingStartedAt(null);
            return;
        }

        const endedAt = new Date().toISOString();

        setIsRecordingRoute(false);
        setRouteDialogMode('create');
        setRouteDialogOpen(true);
        setRouteSubmitError(null);
        setActiveRoute(null);
        populateRouteForm(null, recordingStartedAt, endedAt);
    }, [activeRoutePoints.length, canRecordRoutes, isRecordingRoute, populateRouteForm, recordingStartedAt]);

    const openRouteEditDialog = useCallback(
        (navigationRoute: NavigationRoute) => {
            if (!canRecordRoutes) {
                return;
            }

            setActiveRoute(navigationRoute);
            setRouteDialogMode('edit');
            setRouteDialogOpen(true);
            setRouteSubmitError(null);
            populateRouteForm(navigationRoute);
        },
        [canRecordRoutes, populateRouteForm],
    );

    const openRouteDeleteDialog = useCallback((navigationRoute: NavigationRoute) => {
        if (!canRecordRoutes) {
            return;
        }

        setActiveRoute(navigationRoute);
        setRouteDialogMode('delete');
        setRouteDialogOpen(true);
        setRouteSubmitError(null);
    }, [canRecordRoutes]);

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
        if (!canRecordRoutes) {
            return;
        }

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
                },
            },
        );
    }, [activeRoute, activeRoutePoints, canRecordRoutes, resetRouteDraft, routeDialogMode, routeForm.data.ended_date, routeForm.data.ended_time, routeForm.data.name, routeForm.data.started_date, routeForm.data.started_time, routeForm.data.visibility]);

    const deleteRoute = useCallback(() => {
        if (!canRecordRoutes) {
            return;
        }

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
    }, [activeRoute, canRecordRoutes]);

    const beginPickAnotherSpot = useCallback(() => {
        if (holdOpenTimer.current) {
            window.clearTimeout(holdOpenTimer.current);
            holdOpenTimer.current = null;
        }
        setDialogOpen(false);
        setMapPickMode(true);
    }, []);

    const appendRoutePoint = useCallback((position: [number, number]) => {
        setActiveRoutePoints((currentPoints) => {
            const latestPoint = currentPoints.at(-1);

            if (latestPoint && Math.abs(latestPoint.latitude - position[0]) < 0.0000001 && Math.abs(latestPoint.longitude - position[1]) < 0.0000001) {
                return currentPoints;
            }

            return [
                ...currentPoints,
                {
                    latitude: position[0],
                    longitude: position[1],
                    recorded_at: new Date().toISOString(),
                },
            ];
        });
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
    }, [activeCatch, form, resetDialogState, selectedPosition, t]);

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
    }, [activeCatch, resetDialogState, t]);

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        saveFish();
    };

    const latestTripLabel = stats.latest_trip ? new Date(stats.latest_trip).toLocaleDateString() : t('dashboard.no_trips');
    const fishSpotCount = catchLogs.length.toString();
    const routeCount = navigationRoutes.length.toString();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Fishmap">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <div className="flex min-h-[calc(100svh-4rem)] flex-col p-0 md:h-[calc(100vh-5rem)] md:p-4">
                <section className="relative min-h-0 flex-1 overflow-hidden rounded-none bg-[#081217] md:rounded-[2rem]">
                    <CatchMap
                        catchLogs={catchLogs}
                        navigationRoutes={navigationRoutes}
                        activeRoutePoints={activeRoutePolyline}
                        positionOverride={displayTrackedPosition}
                        selectedPosition={selectedPosition}
                        allowTapSelection={mapPickMode || routeSimulationEnabled}
                        onSelectPosition={(position) => {
                            if (mapPickMode) {
                                setCoordinates(position);
                                setMapPickMode(false);
                                setDialogStep('confirm-location');
                                setDialogOpen(true);
                                return;
                            }

                            if (routeSimulationEnabled) {
                                setSimulatedPosition(position);

                                if (isRecordingRoute) {
                                    appendRoutePoint(position);
                                }
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
                            if (!routeSimulationEnabled && !selectedPosition && position) {
                                setCoordinates(position);
                            }
                        }}
                        onCurrentSpeedChange={setGpsSpeedKmh}
                        onInteractionChange={() => undefined}
                        recenterToCurrentSignal={recenterSignal}
                        externalFocusRequest={mapFocusRequest}
                        onInitialLoadChange={setIsInitialMapLoading}
                        onBoundsChange={() => undefined}
                        onEditCatch={openEditDialog}
                        onDeleteCatch={openDeleteDialog}
                        onEditRoute={openRouteEditDialog}
                        onDeleteRoute={openRouteDeleteDialog}
                        onStartRouteGuidance={requestRouteGuidance}
                        canRecordRoutes={canRecordRoutes}
                        activeGuidanceRouteId={guidedRouteId}
                        guidanceNearestPoint={guidanceMetrics?.nearestPoint ?? null}
                        isGuidanceActive={isGuidanceActive}
                    />

                    <div
                        className={`pointer-events-none absolute inset-x-4 top-4 z-[520] flex max-w-[calc(100%-2rem)] flex-col gap-3 transition-opacity duration-200 md:left-4 md:right-auto md:w-[360px] md:max-w-none ${
                            isInitialMapLoading ? 'opacity-0' : 'opacity-100'
                        }`}
                    >
                        <div className="pointer-events-auto flex items-center justify-start md:hidden">
                            <button
                                type="button"
                                onClick={() => setMobileHudOpen((current) => !current)}
                                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/88 text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur"
                            >
                                {mobileHudOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                            </button>
                        </div>

                        <div className={`${mobileHudOpen ? 'flex' : 'hidden'} pointer-events-auto flex-col gap-3 md:flex`}>
                            <div className="rounded-[1.5rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                                <div className="hidden items-center justify-between gap-3 md:flex">
                                    <Link href={route('home')}>
                                        <AppWordmark className="h-7 w-[155px] sm:h-9 sm:w-[190px]" />
                                    </Link>
                                    <Link href={route('home')} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
                                        {t('app.home')}
                                    </Link>
                                </div>
                                <Link href={route('home')} className="md:hidden">
                                    <AppWordmark className="h-7 w-[155px] sm:h-9 sm:w-[190px]" />
                                </Link>
                                <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{t('dashboard.live_map')}</h1>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{t(canRecordRoutes ? 'dashboard.hold_map' : 'dashboard.hold_map_fish_only')}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                <StatCard
                                    icon={Fish}
                                    label={t('dashboard.fish_spots')}
                                    value={fishSpotCount}
                                    onClick={() => openLibraryDialog('spots')}
                                />
                                <StatCard
                                    icon={Globe}
                                    label={t('dashboard.routes')}
                                    value={routeCount}
                                    onClick={() => openLibraryDialog('routes')}
                                />
                                <StatCard icon={Waves} label={t('dashboard.latest')} value={latestTripLabel} compact className="col-span-2 md:col-span-1" />
                            </div>

                            {canRecordRoutes ? (
                            <div className="rounded-[1.35rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-950">{t('dashboard.route_recording')}</p>
                                        <p className="mt-1 text-xs text-slate-600">
                                            {isRecordingRoute
                                                ? t('dashboard.route_recording_live', { count: activeRoutePoints.length })
                                                : routeSimulationEnabled
                                                  ? t('dashboard.simulation_click_move')
                                                  : t('dashboard.route_recording_idle')}
                                        </p>
                                        {routeSimulationEnabled ? (
                                            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-teal-700">
                                                {t('dashboard.simulation_click_move')}
                                            </p>
                                        ) : null}
                                    </div>
                                    <label className="flex items-center gap-2 self-start text-xs font-medium text-slate-700 sm:self-auto">
                                        <input
                                            type="checkbox"
                                            checked={routeSimulationEnabled}
                                            onChange={(event) => {
                                                const checked = event.target.checked;
                                                setRouteSimulationEnabled(checked);

                                                if (!checked) {
                                                    setSimulatedPosition(null);
                                                }
                                            }}
                                        />
                                        {t('dashboard.simulation')}
                                    </label>
                                </div>

                                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
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
                                        <Button type="button" onClick={() => startRouteRecording()}>
                                            {t('dashboard.start_recording')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            ) : null}

                            {mapPickMode ? (
                                <StatusBanner type="info" message={t('dashboard.tap_to_choose')} />
                            ) : flash.success ? (
                                <StatusBanner type="info" message={flash.success} />
                            ) : null}
                        </div>
                    </div>

                    {guidedRoute ? (
                        <div className="pointer-events-none absolute inset-x-4 bottom-28 z-[515] md:right-5 md:bottom-24 md:left-auto md:w-[340px]">
                            <div className="pointer-events-auto rounded-[1.5rem] border border-white/70 bg-white/92 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/92">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">{t('dashboard.route_guidance')}</p>
                                        <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">{guidedRoute.name}</h3>
                                    </div>
                                    <Button type="button" variant="outline" className="rounded-full" onClick={stopRouteGuidance}>
                                        {t('dashboard.stop_guidance')}
                                    </Button>
                                </div>

                                <div className="mt-4 grid gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="relative flex size-20 items-center justify-center rounded-full border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-100 text-teal-700 shadow-inner dark:border-teal-900/80 dark:from-teal-950/80 dark:to-cyan-950/50 dark:text-teal-300">
                                            <div className="absolute inset-2 rounded-full border border-teal-200/80 dark:border-teal-800/80" />
                                            {guidancePosition ? (
                                                <ArrowUp
                                                    className="size-9 transition-transform duration-200"
                                                    style={{ transform: `rotate(${guidanceMetrics?.rejoinBearing ?? 0}deg)` }}
                                                />
                                            ) : (
                                                <RouteIcon className="size-9" />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                                                {!guidancePosition
                                                    ? t('dashboard.guidance_waiting_position')
                                                    : guidanceMetrics?.onCourse
                                                      ? t('dashboard.guidance_stay_on_course')
                                                      : t('dashboard.guidance_rejoin_line')}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                {!guidancePosition || !guidanceMetrics
                                                    ? t('dashboard.guidance_waiting_position_copy')
                                                    : t('dashboard.guidance_metrics', {
                                                          distance: formatDistanceMeters(guidanceMetrics.offCourseMeters),
                                                          bearing: formatBearing(guidanceMetrics.rejoinBearing),
                                                      })}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/70">
                                            <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">{t('dashboard.speed')}</p>
                                            <p className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">{formatSpeedKmh(displayedSpeedKmh)}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/70">
                                            <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">{t('dashboard.off_line_short')}</p>
                                            <p className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">
                                                {guidanceMetrics ? formatDistanceMeters(guidanceMetrics.offCourseMeters) : '--'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <div className="pointer-events-none absolute bottom-28 left-3 z-[500] md:bottom-20 md:left-5">
                        <div className="pointer-events-auto rounded-full border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100">
                            {t('dashboard.speed')}: {formatSpeedKmh(displayedSpeedKmh)}
                        </div>
                    </div>

                    <Dialog
                        open={guidanceConfirmOpen}
                        onOpenChange={(open) => {
                            setGuidanceConfirmOpen(open);
                            if (!open) {
                                setPendingGuidanceRoute(null);
                            }
                        }}
                    >
                        <DialogContent className="left-1/2 top-auto bottom-0 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900">
                            <div className="relative flex max-h-[92dvh] min-h-0 flex-col overflow-hidden p-5 sm:max-h-[85vh] sm:p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
                                <DialogHeader>
                                    <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.confirm_route_guidance')}</DialogTitle>
                                    <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                        {t('dashboard.confirm_route_guidance_copy')}
                                    </DialogDescription>
                                </DialogHeader>

                                {pendingGuidanceRoute ? (
                                    <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/70">
                                        <p className="font-semibold text-slate-950 dark:text-slate-50">{pendingGuidanceRoute.name}</p>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                            {t('dashboard.route_points', { count: pendingGuidanceRoute.point_count })}
                                        </p>
                                    </div>
                                ) : null}

                                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <Button type="button" variant="outline" onClick={() => setGuidanceConfirmOpen(false)}>
                                        {t('common.cancel')}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (pendingGuidanceRoute) {
                                                startRouteGuidance(pendingGuidanceRoute);
                                            }
                                        }}
                                    >
                                        {t('dashboard.start_guidance')}
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={libraryDialogOpen}
                        onOpenChange={(open) => {
                            setLibraryDialogOpen(open);
                            if (!open) {
                                setLibraryDialogMode(null);
                            }
                        }}
                    >
                        <DialogContent className="left-1/2 top-auto bottom-0 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900">
                            <div className="relative flex max-h-[92dvh] min-h-0 flex-col overflow-hidden p-5 sm:max-h-[85vh] sm:p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
                                <DialogHeader>
                                    <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                        {libraryDialogMode === 'routes' ? t('dashboard.routes') : t('dashboard.fish_spots')}
                                    </DialogTitle>
                                    <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                        {libraryDialogMode === 'routes' ? t('dashboard.routes_modal_copy') : t('dashboard.fish_spots_modal_copy')}
                                    </DialogDescription>
                                </DialogHeader>

                                {libraryDialogMode === 'spots' ? (
                                    <div className="mt-6 grid gap-5 overflow-y-auto pr-1">
                                        <div className="grid gap-3">
                                            <h3 className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                                                {t('dashboard.private_fish_spots')}
                                            </h3>
                                            {privateFishSpots.length > 0 ? (
                                                privateFishSpots.map((catchLog) => (
                                                    <button
                                                        key={`private-spot-${catchLog.id}`}
                                                        type="button"
                                                        onClick={() => focusCatchSpot(catchLog)}
                                                        className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-teal-500 dark:hover:bg-slate-900"
                                                    >
                                                        <p className="font-semibold text-slate-950 dark:text-slate-50">{catchLog.species}</p>
                                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                            {catchLog.caught_at ? new Date(catchLog.caught_at).toLocaleString() : t('dashboard.date_not_set')}
                                                        </p>
                                                    </button>
                                                ))
                                            ) : (
                                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.no_private_fish_spots')}</p>
                                            )}
                                        </div>

                                        <div className="grid gap-3">
                                            <h3 className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                                                {t('dashboard.public_fish_spots')}
                                            </h3>
                                            {publicFishSpots.length > 0 ? (
                                                publicFishSpots.map((catchLog) => (
                                                    <button
                                                        key={`public-spot-${catchLog.id}`}
                                                        type="button"
                                                        onClick={() => focusCatchSpot(catchLog)}
                                                        className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-teal-500 dark:hover:bg-slate-900"
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <p className="font-semibold text-slate-950 dark:text-slate-50">{catchLog.species}</p>
                                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                                {catchLog.is_owner ? t('dashboard.yours') : catchLog.owner_name ?? 'Fishmap'}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                            {catchLog.caught_at ? new Date(catchLog.caught_at).toLocaleString() : t('dashboard.date_not_set')}
                                                        </p>
                                                    </button>
                                                ))
                                            ) : (
                                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.no_public_fish_spots')}</p>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {libraryDialogMode === 'routes' ? (
                                    <div className="mt-6 grid gap-3 overflow-y-auto pr-1">
                                        {navigationRoutes.length > 0 ? (
                                            navigationRoutes.map((navigationRoute) => (
                                                <button
                                                    key={`route-library-${navigationRoute.id}`}
                                                    type="button"
                                                    onClick={() => requestRouteGuidance(navigationRoute)}
                                                    className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-teal-500 dark:hover:bg-slate-900"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <p className="font-semibold text-slate-950 dark:text-slate-50">{navigationRoute.name}</p>
                                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                            {navigationRoute.is_owner ? t('dashboard.yours') : navigationRoute.owner_name ?? 'Fishmap'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                        {t('dashboard.route_points', { count: navigationRoute.point_count })}
                                                    </p>
                                                </button>
                                            ))
                                        ) : (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.no_routes_available')}</p>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </DialogContent>
                    </Dialog>

                    <div className="absolute right-3 bottom-14 z-[500] flex flex-col items-end gap-2 md:right-5 md:bottom-5 md:gap-3">
                        <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-11 w-11 rounded-full shadow-lg md:h-12 md:w-12"
                            onClick={() => {
                                if (displayTrackedPosition) {
                                    setRecenterSignal(Date.now());
                                } else {
                                    fetchCurrentPositionForCatch();
                                }
                            }}
                        >
                            <Crosshair />
                        </Button>

                        <Button
                            type="button"
                            size="icon"
                            className="h-11 w-11 rounded-full shadow-lg md:h-14 md:w-14"
                            onClick={() => openActionDialog(selectedPosition)}
                        >
                            <Plus className="size-5" />
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
                            className="left-1/2 top-auto bottom-0 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900"
                        >
                            <div className="relative flex max-h-[92dvh] min-h-0 flex-col overflow-hidden p-5 sm:max-h-[90vh] sm:p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />

                                {dialogStep === 'action' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.what_do')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.what_do_copy')}</DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 grid gap-3 overflow-y-auto pr-1">
                                            <button
                                                type="button"
                                                onClick={() => setDialogStep('location-mode')}
                                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                            >
                                                <p className="font-semibold text-slate-950">{t('dashboard.add_a_fish')}</p>
                                                <p className="mt-1 text-sm text-slate-600">{t('dashboard.add_a_fish_copy')}</p>
                                            </button>

                                            {canRecordRoutes ? (
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
                                            ) : null}
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'navigation' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.navigation_later')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.navigation_later_copy')}</DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 overflow-y-auto rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
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
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.where_caught')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.where_caught_copy')}</DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 grid gap-3 overflow-y-auto pr-1">
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
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.confirm_location')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.confirm_location_copy')}</DialogDescription>
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
                                                <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {activeCatch ? t('dashboard.edit_details') : t('dashboard.add_details')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.details_copy')}</DialogDescription>
                                        </DialogHeader>

                                        {submitError ? <StatusBanner type="warning" message={submitError} /> : null}

                                        <form onSubmit={submit} className="mt-6 grid gap-4 overflow-y-auto pr-1">
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

                                            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex flex-col gap-3 sm:flex-row">
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
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.delete_pin')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.delete_pin_copy')}</DialogDescription>
                                        </DialogHeader>

                                        {submitError ? <StatusBanner type="warning" message={submitError} /> : null}

                                        <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            {activeCatch ? t('dashboard.delete_selected', { species: activeCatch.species }) : t('dashboard.no_spot')}
                                        </div>

                                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                                        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{successTitle}</h3>
                                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{successMessage}</p>
                                    </div>
                                ) : null}

                                {dialogStep === 'details' && form.processing ? (
                                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[1.75rem] bg-white/92 text-center backdrop-blur">
                                        <div className="flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                                            <LoaderCircle className="size-8 animate-spin" />
                                        </div>
                                        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.saving_fish')}</h3>
                                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.saving_fish_copy')}</p>
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
                        <DialogContent className="left-1/2 top-auto bottom-0 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900">
                            <div className="relative flex max-h-[92dvh] min-h-0 flex-col overflow-hidden p-5 sm:max-h-[90vh] sm:p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />

                                {routeDialogMode === 'create' || routeDialogMode === 'edit' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {routeDialogMode === 'create' ? t('dashboard.save_route') : t('dashboard.edit_route')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {routeDialogMode === 'create' ? t('dashboard.save_route_copy') : t('dashboard.edit_route_copy')}
                                            </DialogDescription>
                                        </DialogHeader>

                                        {routeSubmitError ? <StatusBanner type="warning" message={routeSubmitError} /> : null}

                                        <div className="mt-6 grid gap-4 overflow-y-auto pr-1">
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

                                            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
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
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">{t('dashboard.delete_route')}</DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('dashboard.delete_route_copy')}</DialogDescription>
                                        </DialogHeader>

                                        {routeSubmitError ? <StatusBanner type="warning" message={routeSubmitError} /> : null}

                                        <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            {activeRoute ? t('dashboard.delete_route_selected', { name: activeRoute.name }) : t('dashboard.no_trips')}
                                        </div>

                                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
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
    onClick,
    className = '',
}: {
    icon: typeof Fish;
    label: string;
    value: string;
    compact?: boolean;
    onClick?: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-[1.35rem] border border-white/70 bg-white/88 p-4 text-left shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur ${onClick ? 'transition hover:-translate-y-0.5 hover:border-teal-200' : ''} ${className}`}
        >
            <Icon className="size-4 text-teal-700" />
            <p className={`mt-3 font-semibold text-slate-950 ${compact ? 'text-sm' : 'text-2xl'}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-500 uppercase tracking-[0.18em]">{label}</p>
        </button>
    );
}

function StatusBanner({ type, message }: { type: 'info' | 'warning'; message: string }) {
    return (
        <div
            className={`pointer-events-auto rounded-[1.35rem] border px-4 py-3 text-sm shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur ${
                type === 'warning'
                    ? 'border-amber-200 bg-amber-50/92 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/70 dark:text-amber-200'
                    : 'border-white/70 bg-white/88 text-slate-700 dark:border-slate-700 dark:bg-slate-900/88 dark:text-slate-200'
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

function computeRouteGuidance(position: [number, number], route: NavigationRoute): RouteGuidanceMetrics | null {
    const routePoints = route.points
        .map((point) => [Number(point.latitude), Number(point.longitude)] as [number, number])
        .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));

    if (routePoints.length < 2) {
        return null;
    }

    const referenceLatitude = (position[0] * Math.PI) / 180;
    const metersPerLon = 111320 * Math.cos(referenceLatitude);
    const metersPerLat = 110540;
    const toXY = ([latitude, longitude]: [number, number]) => ({
        x: longitude * metersPerLon,
        y: latitude * metersPerLat,
    });

    const current = toXY(position);
    let bestMatch:
        | {
              distance: number;
              nearestPoint: [number, number];
              rejoinBearing: number;
              onCourse: boolean;
          }
        | null = null;

    for (let index = 0; index < routePoints.length - 1; index += 1) {
        const startLatLng = routePoints[index];
        const endLatLng = routePoints[index + 1];
        const start = toXY(startLatLng);
        const end = toXY(endLatLng);
        const segment = { x: end.x - start.x, y: end.y - start.y };
        const segmentLengthSquared = segment.x ** 2 + segment.y ** 2;

        if (segmentLengthSquared === 0) {
            continue;
        }

        const relative = { x: current.x - start.x, y: current.y - start.y };
        const segmentProgress = Math.min(1, Math.max(0, (relative.x * segment.x + relative.y * segment.y) / segmentLengthSquared));
        const nearestXY = {
            x: start.x + segment.x * segmentProgress,
            y: start.y + segment.y * segmentProgress,
        };
        const nearestPoint: [number, number] = [
            startLatLng[0] + (endLatLng[0] - startLatLng[0]) * segmentProgress,
            startLatLng[1] + (endLatLng[1] - startLatLng[1]) * segmentProgress,
        ];
        const distance = Math.hypot(current.x - nearestXY.x, current.y - nearestXY.y);

        if (!bestMatch || distance < bestMatch.distance) {
            bestMatch = {
                distance,
                nearestPoint,
                rejoinBearing: calculateBearing(position, nearestPoint),
                onCourse: distance <= 12,
            };
        }
    }

    if (!bestMatch) {
        return null;
    }

    return {
        nearestPoint: bestMatch.nearestPoint,
        offCourseMeters: bestMatch.distance,
        rejoinBearing: bestMatch.rejoinBearing,
        onCourse: bestMatch.onCourse,
    };
}

function calculateBearing(start: [number, number], end: [number, number]) {
    const [startLat, startLng] = start;
    const [endLat, endLng] = end;
    const startLatRad = (startLat * Math.PI) / 180;
    const endLatRad = (endLat * Math.PI) / 180;
    const deltaLngRad = ((endLng - startLng) * Math.PI) / 180;

    const y = Math.sin(deltaLngRad) * Math.cos(endLatRad);
    const x =
        Math.cos(startLatRad) * Math.sin(endLatRad) -
        Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(deltaLngRad);

    return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function formatDistanceMeters(distance: number) {
    if (distance >= 1000) {
        return `${(distance / 1000).toFixed(1)} km`;
    }

    return `${Math.round(distance)} m`;
}

function formatSpeedKmh(speed: number | null) {
    if (speed === null || !Number.isFinite(speed)) {
        return '--';
    }

    return `${speed.toFixed(speed >= 10 ? 0 : 1)} km/h`;
}

function calculateDistanceMeters(start: [number, number], end: [number, number]) {
    const earthRadiusMeters = 6371000;
    const deltaLat = ((end[0] - start[0]) * Math.PI) / 180;
    const deltaLng = ((end[1] - start[1]) * Math.PI) / 180;
    const startLat = (start[0] * Math.PI) / 180;
    const endLat = (end[0] * Math.PI) / 180;

    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
}

function formatBearing(bearing: number) {
    const normalized = ((bearing % 360) + 360) % 360;
    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = cardinals[Math.round(normalized / 45) % 8];

    return `${Math.round(normalized)}° ${cardinal}`;
}

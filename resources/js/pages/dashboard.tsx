import AppWordmark from '@/components/app-wordmark';
import { CatchMap } from '@/components/catch-map';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import AppLayout from '@/layouts/app-layout';
import { useTranslator } from '@/lib/i18n';
import { type BreadcrumbItem, type CatchLog, type MapFocusRequest, type NavigationRoute, type SharedData } from '@/types';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    ArrowUp,
    Bug,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Crosshair,
    Fish,
    Globe,
    Layers3,
    LoaderCircle,
    MapPinned,
    Navigation,
    Plus,
    ShieldAlert,
    Wind,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface DashboardProps {
    catchLogs: CatchLog[];
    navigationRoutes: NavigationRoute[];
    bugReports: BugReport[];
    subscription: {
        is_pro: boolean;
        pro_lifetime: boolean;
        pro_expires_at: string | null;
        limits: {
            spots: number;
            routes: number;
            satellite_seconds_monthly: number;
        };
        usage: {
            spots: number;
            routes: number;
            satellite_seconds: number;
        };
        pricing: {
            monthly_eur: string;
            annual_eur: string;
            lifetime_eur: string;
        };
    };
    stats: {
        total_catches: number;
        public_spots: number;
        latest_trip: string | null;
    };
}

interface BugReport {
    id: number;
    category: 'bug' | 'gps' | 'map' | 'account' | 'login' | 'other';
    subject: string;
    message: string;
    status: 'open' | 'reviewing' | 'fixed' | 'closed';
    admin_response: string | null;
    admin_responded_at: string | null;
    created_at: string;
    updated_at: string;
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

interface MarineConditionsPayload {
    source?: string;
    wind: {
        speed_kmh: number | null;
        gust_kmh: number | null;
        direction_deg: number | null;
    };
    tide: {
        state: 'rising' | 'falling' | 'slack' | null;
        next_event_type?: 'high' | 'low' | null;
        next_event_at?: string | null;
        next_event_m?: number | null;
        next_high_at: string | null;
        next_low_at: string | null;
        next_high_m: number | null;
        next_low_m: number | null;
        coefficient: number | null;
        level_msl_m: number | null;
    };
}

const inputClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400 dark:focus:ring-teal-900/40';
const MIN_ROUTE_POINT_INTERVAL_MS = 900;
const MIN_ROUTE_POINT_DISTANCE_METERS = 3;
const MAX_REASONABLE_ROUTE_SPEED_KMH = 220;
const MAX_ROUTE_ACCURACY_FOR_MOVING_METERS = 120;
const SAFETY_NOTICE_STORAGE_KEY = 'fishmap.safety-privacy-ack.v1';

export default function Dashboard({ catchLogs, navigationRoutes, bugReports, subscription }: DashboardProps) {
    const { flash, auth } = usePage<SharedData>().props;
    const { t } = useTranslator();
    const canRecordRoutes = Boolean(auth.user);
    const canSimulateRoutes = Boolean(auth.user?.is_admin);
    const isNativeRuntime = Capacitor.isNativePlatform();
    const [satelliteSecondsUsed, setSatelliteSecondsUsed] = useState(subscription.usage.satellite_seconds);
    const isPro = subscription.is_pro;
    const satelliteSecondsRemaining = Math.max(0, subscription.limits.satellite_seconds_monthly - satelliteSecondsUsed);
    const canUseSatellite = isPro || satelliteSecondsRemaining > 0;
    const spotLimitReached = !isPro && subscription.usage.spots >= subscription.limits.spots;
    const routeLimitReached = !isPro && subscription.usage.routes >= subscription.limits.routes;
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'NautiBite',
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
    const [isSavingRoute, setIsSavingRoute] = useState(false);
    const [mobileHudOpen, setMobileHudOpen] = useState(false);
    const [mapFocusRequest, setMapFocusRequest] = useState<MapFocusRequest | null>(null);
    const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
    const [libraryDialogMode, setLibraryDialogMode] = useState<LibraryDialogMode>(null);
    const [guidedRouteId, setGuidedRouteId] = useState<number | null>(null);
    const [pendingGuidanceRoute, setPendingGuidanceRoute] = useState<NavigationRoute | null>(null);
    const [guidanceConfirmOpen, setGuidanceConfirmOpen] = useState(false);
    const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number | null>(null);
    const [gpsSpeedKmh, setGpsSpeedKmh] = useState<number | null>(null);
    const [currentHeadingDeg, setCurrentHeadingDeg] = useState<number | null>(null);
    const [deviceHeadingDeg, setDeviceHeadingDeg] = useState<number | null>(null);
    const lastMovementSample = useRef<{ position: [number, number]; timestamp: number } | null>(null);
    const [isMapInteracting, setIsMapInteracting] = useState(false);
    const [followPausedByUser, setFollowPausedByUser] = useState(false);
    const [isFollowModeActive, setIsFollowModeActive] = useState(false);
    const [sessionMaxSpeedKmh, setSessionMaxSpeedKmh] = useState<number>(0);
    const [marineConditions, setMarineConditions] = useState<MarineConditionsPayload | null>(null);
    const [marineConditionsError, setMarineConditionsError] = useState<string | null>(null);
    const [marineConditionsLoading, setMarineConditionsLoading] = useState(false);
    const lastMarineFetchRef = useRef<{ latitude: number; longitude: number; fetchedAt: number } | null>(null);
    const lastMarineRequestAtRef = useRef<number>(0);
    const marineRequestInFlightRef = useRef(false);
    const [statsCollapsed, setStatsCollapsed] = useState(true);
    const [routeCardCollapsed, setRouteCardCollapsed] = useState(true);
    const [marineCardCollapsed, setMarineCardCollapsed] = useState(true);
    const [bugReportDialogOpen, setBugReportDialogOpen] = useState(false);
    const [isSubmittingBugReport, setIsSubmittingBugReport] = useState(false);
    const [routeEditModeRouteId, setRouteEditModeRouteId] = useState<number | null>(null);
    const [routeEditDraftPoints, setRouteEditDraftPoints] = useState<Array<{ latitude: number; longitude: number; recorded_at: string }>>([]);
    const [routeEditSelection, setRouteEditSelection] = useState<[number, number] | null>(null);
    const [routeEditDrawPoints, setRouteEditDrawPoints] = useState<[number, number][]>([]);
    const [safetyNoticeOpen, setSafetyNoticeOpen] = useState(false);
    const safetyNoticeAcceptedRef = useRef(false);

    useEffect(() => {
        setSatelliteSecondsUsed(subscription.usage.satellite_seconds);
    }, [subscription.usage.satellite_seconds]);

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

    const bugReportForm = useForm({
        category: 'bug' as BugReport['category'],
        subject: '',
        message: '',
        client_platform: '',
        client_context: '',
        website: '',
    });

    const selectedPosition = useMemo<[number, number] | null>(() => {
        const latitude = Number(form.data.latitude);
        const longitude = Number(form.data.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        return [latitude, longitude];
    }, [form.data.latitude, form.data.longitude]);

    const simulationEnabled = canSimulateRoutes && routeSimulationEnabled;
    const displayTrackedPosition = simulationEnabled && simulatedPosition ? simulatedPosition : currentTrackedPosition;
    const activeRoutePolyline = activeRoutePoints.map((point) => [point.latitude, point.longitude] as [number, number]);
    const routeEditDraftPolyline = routeEditDraftPoints.map((point) => [point.latitude, point.longitude] as [number, number]);
    const routeEditSelectionPoints = routeEditSelection
        ? [routeEditDraftPolyline[routeEditSelection[0]], routeEditDraftPolyline[routeEditSelection[1]]].filter(Boolean)
        : [];
    const hasRouteEditTwoAnchors = Boolean(routeEditSelection && routeEditSelection[0] !== routeEditSelection[1]);

    const privateFishSpots = useMemo(() => catchLogs.filter((catchLog) => catchLog.is_owner && catchLog.visibility === 'private'), [catchLogs]);

    const publicFishSpots = useMemo(() => catchLogs.filter((catchLog) => catchLog.visibility === 'public'), [catchLogs]);

    const guidedRoute = useMemo(
        () => navigationRoutes.find((navigationRoute) => navigationRoute.id === guidedRouteId) ?? null,
        [guidedRouteId, navigationRoutes],
    );

    const guidancePosition = simulationEnabled && simulatedPosition ? simulatedPosition : currentTrackedPosition;

    const guidanceMetrics = useMemo<RouteGuidanceMetrics | null>(() => {
        if (!guidedRoute || !guidancePosition) {
            return null;
        }

        return computeRouteGuidance(guidancePosition, guidedRoute);
    }, [guidancePosition, guidedRoute]);

    const isGuidanceActive = Boolean(guidedRoute);
    const displayedSpeedKmh = simulationEnabled ? currentSpeedKmh : (gpsSpeedKmh ?? currentSpeedKmh);
    const shouldAutoFollowPosition =
        isFollowModeActive ||
        (!dialogOpen && !routeDialogOpen && !libraryDialogOpen && !guidanceConfirmOpen && !mobileHudOpen && !isMapInteracting && !followPausedByUser);
    const guidanceArrowRotation = useMemo(() => {
        if (!guidanceMetrics) {
            return 0;
        }

        const effectiveHeading = (displayedSpeedKmh ?? 0) >= 4 ? (currentHeadingDeg ?? deviceHeadingDeg) : (deviceHeadingDeg ?? currentHeadingDeg);

        if (effectiveHeading === null) {
            return guidanceMetrics.rejoinBearing;
        }

        return (((guidanceMetrics.rejoinBearing - effectiveHeading) % 360) + 360) % 360;
    }, [currentHeadingDeg, deviceHeadingDeg, displayedSpeedKmh, guidanceMetrics]);

    useEffect(() => {
        if (!canSimulateRoutes && routeSimulationEnabled) {
            setRouteSimulationEnabled(false);
            setSimulatedPosition(null);
        }
    }, [canSimulateRoutes, routeSimulationEnabled]);

    useEffect(() => {
        let startX: number | null = null;
        let startY: number | null = null;

        const onTouchStart = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (!touch || touch.clientX > 24) {
                startX = null;
                startY = null;
                return;
            }

            startX = touch.clientX;
            startY = touch.clientY;
        };

        const onTouchEnd = (event: TouchEvent) => {
            if (startX === null || startY === null) {
                return;
            }

            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = Math.abs(touch.clientY - startY);

            startX = null;
            startY = null;

            if (deltaX > 70 && deltaY < 60) {
                window.dispatchEvent(new CustomEvent('mobile-sidebar-open'));
            }
        };

        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });

        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, []);

    useEffect(() => {
        if (!isGuidanceActive) {
            setDeviceHeadingDeg(null);
            return;
        }

        const onDeviceOrientation = (event: DeviceOrientationEvent) => {
            const heading = extractDeviceHeading(event);

            if (heading === null) {
                return;
            }

            setDeviceHeadingDeg((previous) => {
                if (previous === null) {
                    return heading;
                }

                const delta = shortestCircularDiff(previous, heading);
                const absoluteDelta = Math.abs(delta);

                if (absoluteDelta < 8) {
                    return previous;
                }

                const factor = absoluteDelta > 45 ? 0.06 : 0.1;
                const next = interpolateCircularDegrees(previous, heading, factor);

                return limitCircularStep(previous, next, 3.5);
            });
        };

        window.addEventListener('deviceorientationabsolute', onDeviceOrientation as EventListener, true);
        window.addEventListener('deviceorientation', onDeviceOrientation as EventListener, true);

        return () => {
            window.removeEventListener('deviceorientationabsolute', onDeviceOrientation as EventListener, true);
            window.removeEventListener('deviceorientation', onDeviceOrientation as EventListener, true);
        };
    }, [isGuidanceActive]);

    useEffect(() => {
        if (isRecordingRoute || isGuidanceActive) {
            setFollowPausedByUser(false);
        }
    }, [isGuidanceActive, isRecordingRoute]);

    useEffect(() => {
        if (!isFollowModeActive) {
            return;
        }

        const speed = displayedSpeedKmh ?? 0;
        if (speed > sessionMaxSpeedKmh) {
            setSessionMaxSpeedKmh(speed);
        }
    }, [displayedSpeedKmh, isFollowModeActive, sessionMaxSpeedKmh]);

    useEffect(() => {
        if (!shouldAutoFollowPosition || !displayTrackedPosition) {
            return;
        }

        setMapFocusRequest({
            center: displayTrackedPosition,
            key: Date.now(),
        });
    }, [displayTrackedPosition, shouldAutoFollowPosition]);

    useEffect(() => {
        if (!simulationEnabled && !isRecordingRoute) {
            setSimulatedPosition(null);
        }
    }, [isRecordingRoute, simulationEnabled]);

    useEffect(() => {
        if (!displayTrackedPosition || simulationEnabled) {
            return;
        }

        if (marineRequestInFlightRef.current) {
            return;
        }

        const [latitude, longitude] = displayTrackedPosition;
        const previous = lastMarineFetchRef.current;
        const now = Date.now();
        const MIN_MARINE_FETCH_INTERVAL_MS = 45 * 1000;

        if (now - lastMarineRequestAtRef.current < MIN_MARINE_FETCH_INTERVAL_MS) {
            return;
        }

        if (previous) {
            const movedMeters = calculateDistanceMeters([previous.latitude, previous.longitude], [latitude, longitude]);
            const withinTimeWindow = now - previous.fetchedAt < 12 * 60 * 1000;

            if (movedMeters < 450 && withinTimeWindow) {
                return;
            }
        }

        marineRequestInFlightRef.current = true;
        lastMarineRequestAtRef.current = now;
        setMarineConditionsLoading(true);
        setMarineConditionsError(null);

        const url = `${route('marine-conditions')}?latitude=${latitude}&longitude=${longitude}`;
        fetch(url, { headers: { Accept: 'application/json' } })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Marine conditions request failed: ${response.status}`);
                }

                return (await response.json()) as MarineConditionsPayload;
            })
            .then((payload) => {
                setMarineConditions(payload);
                lastMarineFetchRef.current = {
                    latitude,
                    longitude,
                    fetchedAt: Date.now(),
                };
            })
            .catch(() => {
                setMarineConditionsError(t('common.error'));
            })
            .finally(() => {
                marineRequestInFlightRef.current = false;
                setMarineConditionsLoading(false);
            });
    }, [displayTrackedPosition, simulationEnabled, t]);

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
        if (window.localStorage.getItem(SAFETY_NOTICE_STORAGE_KEY) !== 'accepted') {
            setSafetyNoticeOpen(true);
        }
    }, []);

    const acceptSafetyNotice = useCallback(() => {
        safetyNoticeAcceptedRef.current = true;
        window.localStorage.setItem(SAFETY_NOTICE_STORAGE_KEY, 'accepted');
        setSafetyNoticeOpen(false);
    }, []);

    useEffect(() => {
        if (!displayTrackedPosition) {
            lastMovementSample.current = null;
            setCurrentSpeedKmh(null);
            setCurrentHeadingDeg(null);
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
        if (distanceMeters >= 1) {
            setCurrentHeadingDeg(calculateBearing(previousSample.position, displayTrackedPosition));
        }

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

    const shareCatchLog = useCallback(
        (catchLog: CatchLog) => {
            if (!isPro) {
                setSubmitError(t('dashboard.pro_private_sharing_required'));
                setLibraryDialogOpen(false);
                return;
            }

            router.post(route('catch-logs.share', catchLog.id), {}, { preserveScroll: true });
        },
        [isPro, t],
    );

    const revokeCatchLogShare = useCallback((catchLog: CatchLog) => {
        router.delete(route('catch-logs.share.destroy', catchLog.id), { preserveScroll: true });
    }, []);

    const shareNavigationRoute = useCallback(
        (navigationRoute: NavigationRoute) => {
            if (!isPro) {
                setSubmitError(t('dashboard.pro_private_sharing_required'));
                setLibraryDialogOpen(false);
                return;
            }

            router.post(route('navigation-routes.share', navigationRoute.id), {}, { preserveScroll: true });
        },
        [isPro, t],
    );

    const revokeNavigationRouteShare = useCallback((navigationRoute: NavigationRoute) => {
        router.delete(route('navigation-routes.share.destroy', navigationRoute.id), { preserveScroll: true });
    }, []);

    const copyShareUrl = useCallback(
        async (url: string | null | undefined) => {
            if (!url) {
                return;
            }

            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    window.prompt(t('dashboard.copy_share_link'), url);
                }
            } catch {
                window.prompt(t('dashboard.copy_share_link'), url);
            }

            setSubmitError(t('dashboard.share_link_copied'));
            setLibraryDialogOpen(false);
        },
        [t],
    );

    const fetchCurrentPositionForCatch = useCallback(() => {
        const fetchNative = async () => {
            try {
                const permission = await Geolocation.requestPermissions();

                if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
                    return;
                }

                const position = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 15000,
                });

                setCoordinates([position.coords.latitude, position.coords.longitude]);
            } catch {
                // Keep web fallback below.
            }
        };

        if (Capacitor.isNativePlatform()) {
            void fetchNative();
            return;
        }

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
        async (navigationRoute: NavigationRoute) => {
            await requestDeviceHeadingPermission();
            setGuidedRouteId(navigationRoute.id);
            focusNavigationRoute(navigationRoute);
            setPendingGuidanceRoute(null);
            setGuidanceConfirmOpen(false);
            setLibraryDialogOpen(false);
            setLibraryDialogMode(null);
            setMobileHudOpen(false);
            setDialogOpen(false);
            setRouteDialogOpen(false);
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

            if (routeLimitReached) {
                setSubmitError(t('dashboard.pro_route_limit_reached', { count: subscription.limits.routes }));
                setDialogOpen(false);
                return;
            }

            const startPosition =
                forcedStartPosition ??
                (simulationEnabled ? (simulatedPosition ?? currentTrackedPosition ?? [38.7223, -9.1393]) : currentTrackedPosition);

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

            if (simulationEnabled) {
                setSimulatedPosition(startPosition);
            }
        },
        [canRecordRoutes, currentTrackedPosition, routeLimitReached, simulationEnabled, simulatedPosition, subscription.limits.routes, t],
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

    const startRouteGeometryEdit = useCallback(() => {
        if (!activeRoute) {
            return;
        }

        const parsedPoints = activeRoute.points
            .map((point) => ({
                latitude: Number(String(point.latitude).replace(',', '.')),
                longitude: Number(String(point.longitude).replace(',', '.')),
                recorded_at: point.recorded_at ?? new Date().toISOString(),
            }))
            .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

        if (parsedPoints.length < 2) {
            setRouteSubmitError('Route must have at least 2 valid points to edit on map.');
            return;
        }

        setRouteEditDraftPoints(parsedPoints);
        setRouteEditSelection(null);
        setRouteEditDrawPoints([]);
        setRouteEditModeRouteId(activeRoute.id);
        setRouteDialogOpen(false);
    }, [activeRoute]);

    const handleRouteEditMapPick = useCallback(
        (routeId: number, position: [number, number]) => {
            if (routeId !== routeEditModeRouteId || routeEditDraftPoints.length < 2) {
                return;
            }

            let nearestIndex = 0;
            let nearestDistance = Number.POSITIVE_INFINITY;

            routeEditDraftPoints.forEach((point, index) => {
                const distance = calculateDistanceMeters([point.latitude, point.longitude], position);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = index;
                }
            });

            setRouteEditSelection((current) => {
                if (!current) {
                    setRouteEditDrawPoints([]);
                    return [nearestIndex, nearestIndex];
                }

                if (current[0] === current[1]) {
                    return [current[0], nearestIndex];
                }

                setRouteEditDrawPoints([]);
                return [nearestIndex, nearestIndex];
            });
        },
        [routeEditDraftPoints, routeEditModeRouteId],
    );

    const appendRouteEditDrawPoint = useCallback(
        (position: [number, number]) => {
            if (!routeEditModeRouteId || !routeEditSelection || routeEditSelection[0] !== routeEditSelection[1]) {
                return;
            }

            setRouteEditDrawPoints((current) => {
                const last = current[current.length - 1];
                if (last && Math.abs(last[0] - position[0]) < 0.0000001 && Math.abs(last[1] - position[1]) < 0.0000001) {
                    return current;
                }
                return [...current, position];
            });
        },
        [routeEditModeRouteId, routeEditSelection],
    );

    const removeSelectedRouteSegment = useCallback(() => {
        if (!routeEditSelection) {
            return;
        }

        const startIndex = Math.min(routeEditSelection[0], routeEditSelection[1]);
        const endIndex = Math.max(routeEditSelection[0], routeEditSelection[1]);

        if (endIndex - startIndex < 2) {
            setRouteSubmitError('Pick two points far enough apart to remove the bad segment.');
            return;
        }

        setRouteEditDraftPoints((points) => {
            const nextPoints = points.filter((_, index) => index <= startIndex || index >= endIndex);
            return nextPoints.length >= 2 ? nextPoints : points;
        });
        setRouteEditSelection(null);
        setRouteEditDrawPoints([]);
        setRouteSubmitError(null);
    }, [routeEditSelection]);

    const applyRouteReplacementSegment = useCallback(() => {
        if (!routeEditSelection || routeEditDrawPoints.length < 1) {
            setRouteSubmitError('Pick start/end anchors and draw at least one replacement point.');
            return;
        }

        const startIndex = Math.min(routeEditSelection[0], routeEditSelection[1]);
        const endIndex = Math.max(routeEditSelection[0], routeEditSelection[1]);

        if (startIndex === endIndex) {
            setRouteSubmitError('Pick a different end anchor on the route (or orange marker) to finish replacement.');
            return;
        }

        setRouteEditDraftPoints((points) => {
            const startAnchor = points[startIndex];
            const endAnchor = points[endIndex];
            if (!startAnchor || !endAnchor) {
                return points;
            }

            const replacement = [
                startAnchor,
                ...routeEditDrawPoints.map((drawPoint, idx) => ({
                    latitude: drawPoint[0],
                    longitude: drawPoint[1],
                    recorded_at: new Date(Date.now() + idx * 1000).toISOString(),
                })),
                endAnchor,
            ];

            return [...points.slice(0, startIndex), ...replacement, ...points.slice(endIndex + 1)];
        });

        setRouteEditSelection(null);
        setRouteEditDrawPoints([]);
        setRouteSubmitError(null);
    }, [routeEditDrawPoints, routeEditSelection]);

    const autoPickRouteEditEndAnchor = useCallback(() => {
        if (
            !routeEditSelection ||
            routeEditSelection[0] !== routeEditSelection[1] ||
            routeEditDrawPoints.length === 0 ||
            routeEditDraftPoints.length < 2
        ) {
            return;
        }

        const startIndex = routeEditSelection[0];
        const target = routeEditDrawPoints[routeEditDrawPoints.length - 1];
        if (!target) {
            return;
        }

        let nearestIndex = -1;
        let nearestDistance = Number.POSITIVE_INFINITY;

        routeEditDraftPoints.forEach((point, index) => {
            if (index === startIndex) {
                return;
            }

            const distance = calculateDistanceMeters([point.latitude, point.longitude], target);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });

        if (nearestIndex >= 0) {
            setRouteEditSelection([startIndex, nearestIndex]);
            setRouteSubmitError(null);
        }
    }, [routeEditDraftPoints, routeEditDrawPoints, routeEditSelection]);

    const cancelRouteGeometryEdit = useCallback(() => {
        setRouteEditModeRouteId(null);
        setRouteEditDraftPoints([]);
        setRouteEditSelection(null);
        setRouteEditDrawPoints([]);
    }, []);

    const openRouteDeleteDialog = useCallback(
        (navigationRoute: NavigationRoute) => {
            if (!canRecordRoutes) {
                return;
            }

            setActiveRoute(navigationRoute);
            setRouteDialogMode('delete');
            setRouteDialogOpen(true);
            setRouteSubmitError(null);
        },
        [canRecordRoutes],
    );

    const resetRouteDraft = useCallback(() => {
        setActiveRoutePoints([]);
        setRecordingStartedAt(null);
        setRouteDialogMode(null);
        setActiveRoute(null);
        setRouteSubmitError(null);
        if (!simulationEnabled) {
            setSimulatedPosition(null);
        }
    }, [simulationEnabled]);

    const saveRoute = useCallback(() => {
        if (!canRecordRoutes) {
            return;
        }
        if (isSavingRoute) {
            return;
        }

        setRouteSubmitError(null);
        setIsSavingRoute(true);

        const startedAt = buildCaughtAtIso(routeForm.data.started_date, routeForm.data.started_time);
        const endedAt = buildCaughtAtIso(routeForm.data.ended_date, routeForm.data.ended_time);

        if (!startedAt || !endedAt) {
            setRouteSubmitError('Please use a valid date and time format: DD MM YYYY and 24h HH:mm.');
            setIsSavingRoute(false);
            return;
        }

        if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
            setRouteSubmitError('The route end time cannot be earlier than the start time.');
            setIsSavingRoute(false);
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
                    setIsSavingRoute(false);
                    setRouteSubmitError(
                        errors.name ?? errors.visibility ?? errors.started_at ?? errors.ended_at ?? 'We could not update this route right now.',
                    );
                },
                onSuccess: () => {
                    setIsSavingRoute(false);
                    setRouteDialogOpen(false);
                    setRouteDialogMode(null);
                    setActiveRoute(null);
                },
            });
            return;
        }

        if (activeRoutePoints.length < 2) {
            setRouteSubmitError('A route needs at least two points before it can be saved.');
            setIsSavingRoute(false);
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
                    setIsSavingRoute(false);
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
                    setIsSavingRoute(false);
                    setRouteDialogOpen(false);
                    resetRouteDraft();
                },
            },
        );
    }, [
        activeRoute,
        activeRoutePoints,
        canRecordRoutes,
        isSavingRoute,
        resetRouteDraft,
        routeDialogMode,
        routeForm.data.ended_date,
        routeForm.data.ended_time,
        routeForm.data.name,
        routeForm.data.started_date,
        routeForm.data.started_time,
        routeForm.data.visibility,
    ]);

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

    const saveRouteGeometryEdit = useCallback(() => {
        if (!activeRoute || !routeEditModeRouteId || routeEditDraftPoints.length < 2 || isSavingRoute) {
            return;
        }

        const startedAt = activeRoute.started_at ?? new Date().toISOString();
        const endedAt = activeRoute.ended_at ?? startedAt;

        setIsSavingRoute(true);
        setRouteSubmitError(null);

        router.put(
            route('navigation-routes.update', activeRoute.id),
            {
                name: activeRoute.name || null,
                visibility: activeRoute.visibility,
                started_at: startedAt,
                ended_at: endedAt,
                points: routeEditDraftPoints,
            },
            {
                preserveScroll: true,
                onError: (errors) => {
                    setIsSavingRoute(false);
                    setRouteSubmitError(errors.points ?? errors.name ?? 'Could not save route geometry changes.');
                },
                onSuccess: () => {
                    setIsSavingRoute(false);
                    setRouteEditModeRouteId(null);
                    setRouteEditDraftPoints([]);
                    setRouteEditSelection(null);
                    setActiveRoute(null);
                },
            },
        );
    }, [activeRoute, isSavingRoute, routeEditDraftPoints, routeEditModeRouteId]);

    const beginPickAnotherSpot = useCallback(() => {
        if (holdOpenTimer.current) {
            window.clearTimeout(holdOpenTimer.current);
            holdOpenTimer.current = null;
        }
        setDialogOpen(false);
        setMapPickMode(true);
    }, []);

    const appendRoutePoint = useCallback((position: [number, number], recordedAt?: string, accuracy?: number) => {
        setActiveRoutePoints((currentPoints) => {
            const latestPoint = currentPoints.at(-1);
            const nextRecordedAt = recordedAt ?? new Date().toISOString();

            if (
                latestPoint &&
                Math.abs(latestPoint.latitude - position[0]) < 0.0000001 &&
                Math.abs(latestPoint.longitude - position[1]) < 0.0000001
            ) {
                return currentPoints;
            }

            if (latestPoint) {
                const elapsedMilliseconds = Math.max(new Date(nextRecordedAt).getTime() - new Date(latestPoint.recorded_at).getTime(), 1);
                const distanceMeters = calculateDistanceMeters([latestPoint.latitude, latestPoint.longitude], position);
                const speedKmh = (distanceMeters / elapsedMilliseconds) * 3600;
                const isTooSoonForDenseTrack = elapsedMilliseconds < MIN_ROUTE_POINT_INTERVAL_MS && distanceMeters < 50;
                const isLikelySpike = speedKmh > MAX_REASONABLE_ROUTE_SPEED_KMH || (distanceMeters > 300 && elapsedMilliseconds < 3000);
                const isLikelyStationaryNoise = distanceMeters < MIN_ROUTE_POINT_DISTANCE_METERS && elapsedMilliseconds < 10000;
                const accuracyTooWeakForMove = typeof accuracy === 'number' && accuracy > MAX_ROUTE_ACCURACY_FOR_MOVING_METERS && distanceMeters > 50;

                if (isTooSoonForDenseTrack || isLikelySpike || isLikelyStationaryNoise || accuracyTooWeakForMove) {
                    return currentPoints;
                }
            }

            return [
                ...currentPoints,
                {
                    latitude: position[0],
                    longitude: position[1],
                    recorded_at: nextRecordedAt,
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

    const submitBugReport = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        router.post(
            route('bug-reports.store'),
            {
                ...bugReportForm.data,
                client_platform: isNativeRuntime ? 'android' : 'browser',
                client_context: `${window.location.pathname} ${window.innerWidth}x${window.innerHeight}`,
            },
            {
                preserveScroll: true,
                onStart: () => {
                    setIsSubmittingBugReport(true);
                    bugReportForm.clearErrors();
                },
                onFinish: () => setIsSubmittingBugReport(false),
                onError: (errors) => bugReportForm.setError(errors),
                onSuccess: () => {
                    bugReportForm.reset('subject', 'message', 'website');
                    bugReportForm.setData('category', 'bug');
                    setBugReportDialogOpen(false);
                },
            },
        );
    };

    const handleMapPositionChange = useCallback(
        (sample: { position: [number, number]; accuracy: number; recordedAt: string } | null) => {
            const position = sample?.position ?? null;
            setCurrentTrackedPosition(position);

            if (isRecordingRoute && !routeSimulationEnabled && sample) {
                appendRoutePoint(sample.position, sample.recordedAt, sample.accuracy);
            }

            if (!routeSimulationEnabled && !selectedPosition && sample) {
                setCoordinates(sample.position);
            }
        },
        [appendRoutePoint, isRecordingRoute, routeSimulationEnabled, selectedPosition, setCoordinates],
    );

    const handleMapInteractionChange = useCallback((interacting: boolean) => {
        setIsMapInteracting(interacting);

        if (interacting) {
            setFollowPausedByUser(true);
        }
    }, []);

    const toggleFollowMode = useCallback(() => {
        setIsFollowModeActive((current) => {
            const next = !current;

            if (next) {
                setSessionMaxSpeedKmh(0);
                setFollowPausedByUser(false);
                if (displayTrackedPosition) {
                    setRecenterSignal(Date.now());
                } else {
                    void fetchCurrentPositionForCatch();
                }
            }

            return next;
        });
    }, [displayTrackedPosition, fetchCurrentPositionForCatch]);

    const recordSatelliteUsage = useCallback(
        (seconds: number) => {
            if (isPro) {
                return;
            }

            router.post(
                route('satellite-usage.store'),
                { seconds },
                {
                    preserveScroll: true,
                    preserveState: true,
                    only: ['subscription'],
                    onSuccess: (page) => {
                        const nextSubscription = page.props.subscription as DashboardProps['subscription'] | undefined;
                        if (typeof nextSubscription?.usage.satellite_seconds === 'number') {
                            setSatelliteSecondsUsed(nextSubscription.usage.satellite_seconds);
                        } else {
                            setSatelliteSecondsUsed((current) => Math.min(subscription.limits.satellite_seconds_monthly, current + seconds));
                        }
                    },
                    onError: () => {
                        setSatelliteSecondsUsed((current) => Math.min(subscription.limits.satellite_seconds_monthly, current + seconds));
                    },
                },
            );
        },
        [isPro, subscription.limits.satellite_seconds_monthly],
    );

    const fishSpotCount = catchLogs.length.toString();
    const routeCount = navigationRoutes.length.toString();
    const upcomingTideEvent = getUpcomingTideEvent(marineConditions?.tide);
    const displayedTideState =
        upcomingTideEvent?.type === 'high' ? 'rising' : upcomingTideEvent?.type === 'low' ? 'falling' : marineConditions?.tide.state;
    const satelliteQuotaLabel = isPro
        ? t('dashboard.satellite_quota_pro')
        : t('dashboard.satellite_quota', { remaining: formatDurationShort(satelliteSecondsRemaining) });

    return (
        <AppLayout breadcrumbs={breadcrumbs} hideHeader>
            <Head title="NautiBite">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=manrope:400,500,600,700" rel="stylesheet" />
            </Head>

            <Dialog
                open={safetyNoticeOpen}
                onOpenChange={(open) => {
                    if (open) {
                        setSafetyNoticeOpen(true);
                        return;
                    }
                    if (!safetyNoticeAcceptedRef.current && window.localStorage.getItem(SAFETY_NOTICE_STORAGE_KEY) !== 'accepted') {
                        router.visit(route('home'));
                    }
                }}
            >
                <DialogContent className="top-auto bottom-0 left-1/2 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-y-auto rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-5 sm:top-[50%] sm:bottom-auto sm:max-h-[85vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900">
                    <div className="mx-auto mb-2 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
                    <div className="grid gap-3">
                        <div className="w-fit rounded-2xl bg-amber-100 p-3 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                            <ShieldAlert className="size-6" />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                {t('dashboard.safety_notice_title')}
                            </DialogTitle>
                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                {t('dashboard.safety_notice_copy')}
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="mt-5 grid gap-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                        {[t('dashboard.safety_notice_gps'), t('dashboard.safety_notice_data'), t('dashboard.safety_notice_responsibility')].map(
                            (item) => (
                                <div
                                    key={item}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950"
                                >
                                    {item}
                                </div>
                            ),
                        )}
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Link
                            href={route('privacy')}
                            className="text-sm font-semibold text-teal-800 transition hover:text-teal-700 dark:text-teal-300 dark:hover:text-teal-200"
                        >
                            {t('dashboard.safety_notice_policy')}
                        </Link>
                        <Button type="button" onClick={acceptSafetyNotice} className="rounded-2xl">
                            {t('dashboard.safety_notice_accept')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={bugReportDialogOpen} onOpenChange={setBugReportDialogOpen}>
                <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-3xl border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <DialogHeader className="pr-8 text-left">
                        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            <Bug className="size-5" />
                        </div>
                        <DialogTitle className="text-xl text-slate-950 dark:text-slate-50">{t('dashboard.bug_report_title')}</DialogTitle>
                        <DialogDescription className="leading-6 text-slate-600 dark:text-slate-300">
                            {t('dashboard.bug_report_copy')}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submitBugReport} className="space-y-3">
                        <input
                            value={bugReportForm.data.website}
                            onChange={(event) => bugReportForm.setData('website', event.target.value)}
                            className="hidden"
                            tabIndex={-1}
                            autoComplete="off"
                        />
                        <select
                            value={bugReportForm.data.category}
                            onChange={(event) => bugReportForm.setData('category', event.target.value as BugReport['category'])}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                            <option value="bug">{t('dashboard.bug_category_bug')}</option>
                            <option value="gps">{t('dashboard.bug_category_gps')}</option>
                            <option value="map">{t('dashboard.bug_category_map')}</option>
                            <option value="account">{t('dashboard.bug_category_account')}</option>
                            <option value="login">{t('dashboard.bug_category_login')}</option>
                            <option value="other">{t('dashboard.bug_category_other')}</option>
                        </select>
                        <input
                            value={bugReportForm.data.subject}
                            onChange={(event) => bugReportForm.setData('subject', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            placeholder={t('dashboard.bug_report_subject')}
                            maxLength={160}
                        />
                        <textarea
                            value={bugReportForm.data.message}
                            onChange={(event) => bugReportForm.setData('message', event.target.value)}
                            className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            placeholder={t('dashboard.bug_report_message')}
                            maxLength={3000}
                        />
                        {Object.values(bugReportForm.errors).length > 0 ? (
                            <p className="text-sm text-amber-700 dark:text-amber-300">{Object.values(bugReportForm.errors)[0]}</p>
                        ) : null}
                        <Button type="submit" disabled={isSubmittingBugReport} className="w-full rounded-2xl">
                            {isSubmittingBugReport ? t('common.saving') : t('dashboard.bug_report_send')}
                        </Button>
                    </form>

                    {bugReports.length > 0 ? (
                        <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                            <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase dark:text-slate-400">
                                {t('dashboard.bug_report_recent')}
                            </p>
                            {bugReports.map((report) => (
                                <div
                                    key={report.id}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{report.subject}</p>
                                        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                            {formatBugReportStatus(report.status, t)}
                                        </span>
                                    </div>
                                    {report.admin_response ? (
                                        <p className="mt-2 rounded-xl bg-teal-50 px-2 py-1.5 text-xs leading-5 text-teal-900 dark:bg-teal-950/60 dark:text-teal-100">
                                            {report.admin_response}
                                        </p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            <div className={`flex flex-col p-0 md:h-screen ${isNativeRuntime ? 'min-h-svh' : 'h-[100dvh] min-h-[100dvh]'}`}>
                <section className="relative min-h-0 flex-1 overflow-hidden rounded-none bg-[#081217]">
                    <CatchMap
                        catchLogs={catchLogs}
                        navigationRoutes={navigationRoutes}
                        activeRoutePoints={activeRoutePolyline}
                        positionOverride={displayTrackedPosition}
                        selectedPosition={selectedPosition}
                        allowTapSelection={mapPickMode || routeSimulationEnabled || Boolean(routeEditModeRouteId)}
                        onSelectPosition={(position) => {
                            if (mapPickMode) {
                                setCoordinates(position);
                                setMapPickMode(false);
                                setDialogStep('confirm-location');
                                setDialogOpen(true);
                                return;
                            }

                            if (routeEditModeRouteId) {
                                appendRouteEditDrawPoint(position);
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
                        onCurrentPositionChange={handleMapPositionChange}
                        onCurrentSpeedChange={setGpsSpeedKmh}
                        onInteractionChange={handleMapInteractionChange}
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
                        canUseSatellite={canUseSatellite}
                        onSatelliteUsageTick={recordSatelliteUsage}
                        keepTrackingInBackground={isRecordingRoute || isGuidanceActive || isFollowModeActive}
                        activeGuidanceRouteId={guidedRouteId}
                        guidanceNearestPoint={guidanceMetrics?.nearestPoint ?? null}
                        isGuidanceActive={isGuidanceActive}
                        routeEditRouteId={routeEditModeRouteId}
                        routeEditPoints={routeEditDraftPolyline}
                        routeEditSelectionPoints={routeEditSelectionPoints as [number, number][]}
                        routeEditDrawPoints={routeEditDrawPoints}
                        onRouteEditMapPick={handleRouteEditMapPick}
                    />

                    <div
                        className={`pointer-events-none absolute inset-x-4 top-4 z-[520] flex max-w-[calc(100%-2rem)] flex-col gap-3 transition-opacity duration-200 md:right-auto md:left-4 md:w-[360px] md:max-w-none ${
                            isInitialMapLoading ? 'opacity-0' : 'opacity-100'
                        }`}
                    >
                        <div className="pointer-events-auto flex items-center gap-2 md:hidden">
                            <SidebarTrigger className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/88 text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/88 dark:text-white" />
                            <button
                                type="button"
                                onClick={() => setMobileHudOpen((current) => !current)}
                                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/88 text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/88 dark:text-white"
                                title={mobileHudOpen ? t('common.close') : t('dashboard.map_tools')}
                            >
                                {mobileHudOpen ? <X className="size-5" /> : <Layers3 className="size-5" />}
                            </button>
                        </div>

                        <div
                            className={`${mobileHudOpen ? 'flex' : 'hidden'} pointer-events-auto max-h-[calc(100svh-5rem)] flex-col gap-3 overflow-y-auto pr-1 md:flex md:max-h-none md:overflow-visible md:pr-0`}
                        >
                            <div className="hidden rounded-[1.5rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur md:block dark:border-slate-700 dark:bg-slate-900/88">
                                <div className="hidden justify-center md:flex">
                                    <Link href={route('home')} className="block">
                                        <AppWordmark className="h-28 w-[210px]" />
                                    </Link>
                                </div>
                                <div className="mt-3 rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-center text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
                                    {satelliteQuotaLabel}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                    {t(canRecordRoutes ? 'dashboard.hold_map' : 'dashboard.hold_map_fish_only')}
                                </p>
                            </div>

                            <div className="rounded-[1.35rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/88">
                                <button
                                    type="button"
                                    onClick={() => setStatsCollapsed((current) => !current)}
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                                        {t('dashboard.fish_spots')} / {t('dashboard.routes')}
                                    </p>
                                    {statsCollapsed ? (
                                        <ChevronDown className="size-4 text-slate-600 dark:text-slate-300" />
                                    ) : (
                                        <ChevronUp className="size-4 text-slate-600 dark:text-slate-300" />
                                    )}
                                </button>
                                {!statsCollapsed ? (
                                    <div className="mt-3 grid grid-cols-2 gap-3">
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
                                    </div>
                                ) : null}
                            </div>

                            {canRecordRoutes ? (
                                <div className="rounded-[1.35rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/88">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                                                {t('dashboard.route_recording')}
                                            </p>
                                            <p className="mt-1 pr-4 text-xs text-slate-600 dark:text-slate-300">
                                                {isRecordingRoute
                                                    ? t('dashboard.route_recording_live', { count: activeRoutePoints.length })
                                                    : simulationEnabled
                                                      ? t('dashboard.simulation_click_move')
                                                      : t('dashboard.route_recording_idle')}
                                            </p>
                                            {simulationEnabled ? (
                                                <p className="mt-1 text-[11px] font-medium tracking-[0.18em] text-teal-700 uppercase dark:text-teal-300">
                                                    {t('dashboard.simulation_click_move')}
                                                </p>
                                            ) : null}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setRouteCardCollapsed((current) => !current)}
                                            className="rounded-full p-1 text-slate-600 dark:text-slate-300"
                                        >
                                            {routeCardCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                                        </button>
                                    </div>

                                    {!routeCardCollapsed ? (
                                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                                            {canSimulateRoutes ? (
                                                <label className="flex items-center gap-2 self-start text-xs font-medium text-slate-700 sm:self-auto dark:text-slate-200">
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
                                            ) : null}
                                            <select
                                                value={recordingVisibility}
                                                onChange={(event) => setRecordingVisibility(event.target.value as 'private' | 'public')}
                                                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                                    ) : null}
                                </div>
                            ) : null}

                            {canRecordRoutes ? (
                                <div className="rounded-[1.35rem] border border-white/70 bg-white/88 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/88">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                                                {t('dashboard.marine_conditions')}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t('dashboard.marine_conditions_copy')}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Wind className="mt-0.5 size-4 text-cyan-700" />
                                            <button
                                                type="button"
                                                onClick={() => setMarineCardCollapsed((current) => !current)}
                                                className="rounded-full p-1 text-slate-600 dark:text-slate-300"
                                            >
                                                {marineCardCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {!marineCardCollapsed ? (
                                        <>
                                            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                                <div className="col-span-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 dark:border-teal-900/70 dark:bg-teal-950/45">
                                                    <p className="font-medium text-teal-800 dark:text-teal-300">{t('dashboard.next_tide')}</p>
                                                    <p className="mt-1 text-sm font-semibold text-teal-950 dark:text-teal-50">
                                                        {formatTideEventLabel(upcomingTideEvent?.type, t)} ·{' '}
                                                        {formatTideTimeAndHeight(upcomingTideEvent?.at, upcomingTideEvent?.height)}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                                                    <p className="font-medium text-slate-500 dark:text-slate-400">{t('dashboard.wind')}</p>
                                                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {formatWindLabel(marineConditions?.wind.speed_kmh, marineConditions?.wind.direction_deg)}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                                                    <p className="font-medium text-slate-500 dark:text-slate-400">{t('dashboard.wind_gust')}</p>
                                                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {formatSpeedKmh(marineConditions?.wind.gust_kmh ?? null)}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                                                    <p className="font-medium text-slate-500 dark:text-slate-400">{t('dashboard.next_high_tide')}</p>
                                                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {formatTideTimeAndHeight(
                                                            marineConditions?.tide.next_high_at,
                                                            marineConditions?.tide.next_high_m,
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                                                    <p className="font-medium text-slate-500 dark:text-slate-400">{t('dashboard.next_low_tide')}</p>
                                                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {formatTideTimeAndHeight(
                                                            marineConditions?.tide.next_low_at,
                                                            marineConditions?.tide.next_low_m,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-medium text-cyan-900 dark:border-cyan-900/70 dark:bg-cyan-950/45 dark:text-cyan-200">
                                                    {t('dashboard.tide_state')}: {formatTideState(displayedTideState, t)}
                                                </span>
                                                <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-900 dark:border-violet-900/70 dark:bg-violet-950/45 dark:text-violet-200">
                                                    {t('dashboard.tide_coefficient')}: {marineConditions?.tide.coefficient ?? '--'}
                                                </span>
                                            </div>
                                        </>
                                    ) : null}

                                    {marineConditionsLoading ? (
                                        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                                            {t('dashboard.loading_marine_conditions')}
                                        </p>
                                    ) : null}
                                    {marineConditionsError ? <p className="mt-3 text-[11px] text-amber-700">{marineConditionsError}</p> : null}
                                    {marineConditions?.source === 'unavailable' ? (
                                        <p className="mt-3 text-[11px] text-amber-700">{t('dashboard.tide_official_unavailable')}</p>
                                    ) : null}
                                </div>
                            ) : null}

                            {submitError ? (
                                <StatusBanner type={submitError === t('dashboard.share_link_copied') ? 'info' : 'warning'} message={submitError} />
                            ) : mapPickMode ? (
                                <StatusBanner type="info" message={t('dashboard.tap_to_choose')} />
                            ) : flash.success ? (
                                <StatusBanner type="info" message={flash.success} />
                            ) : null}
                        </div>
                    </div>

                    {guidedRoute ? (
                        <div className="pointer-events-none absolute top-16 right-3 left-3 z-[515] md:inset-x-auto md:top-auto md:right-5 md:bottom-24 md:left-auto">
                            <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-white/70 bg-white/92 px-2.5 py-2 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur md:gap-3 md:px-3 dark:border-slate-700 dark:bg-slate-900/92">
                                <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-100 text-teal-700 shadow-inner md:size-11 dark:border-teal-900/80 dark:from-teal-950/80 dark:to-cyan-950/50 dark:text-teal-300">
                                    <div className="absolute inset-1 rounded-full border border-teal-200/80 dark:border-teal-800/80" />
                                    <ArrowUp
                                        className="size-5 transition-transform duration-200"
                                        style={{ transform: `rotate(${guidanceArrowRotation}deg)` }}
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-semibold tracking-[0.18em] text-teal-700 uppercase">
                                        {t('dashboard.route_guidance')}
                                    </p>
                                    <p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{guidedRoute.name}</p>
                                    <p className="text-xs text-slate-600 dark:text-slate-300">
                                        {guidanceMetrics ? formatDistanceMeters(guidanceMetrics.offCourseMeters) : '--'} •{' '}
                                        {guidanceMetrics ? formatBearing(guidanceMetrics.rejoinBearing) : '--'}
                                    </p>
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 shrink-0 rounded-full px-3 text-xs"
                                    onClick={stopRouteGuidance}
                                >
                                    {t('dashboard.stop_guidance')}
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    {isRecordingRoute ? (
                        <div className="pointer-events-none absolute right-3 bottom-44 z-[505] md:hidden">
                            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/70 bg-white/92 px-3 py-2 text-xs font-semibold text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/92 dark:text-slate-100">
                                <span className="inline-flex size-2.5 animate-pulse rounded-full bg-rose-500" />
                                <span>{activeRoutePoints.length} pts</span>
                                <Button type="button" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={stopRouteRecording}>
                                    {t('dashboard.stop_recording')}
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="pointer-events-none absolute bottom-28 left-3 z-[500] md:bottom-20 md:left-5">
                        <div className="pointer-events-auto rounded-full border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100">
                            {t('dashboard.speed')}: {formatSpeedKmh(displayedSpeedKmh)}
                            {isFollowModeActive ? `  |  ${t('dashboard.max_speed')}: ${formatSpeedKmh(sessionMaxSpeedKmh)}` : ''}
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
                        <DialogContent className="top-auto bottom-0 left-1/2 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900">
                            <div className="relative flex max-h-[92dvh] min-h-0 flex-col overflow-hidden p-5 sm:max-h-[85vh] sm:p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
                                <DialogHeader>
                                    <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                        {t('dashboard.confirm_route_guidance')}
                                    </DialogTitle>
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
                        <DialogContent className="top-auto bottom-0 left-1/2 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900">
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
                                                    <div
                                                        key={`private-spot-${catchLog.id}`}
                                                        className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-teal-500 dark:hover:bg-slate-900"
                                                    >
                                                        <button type="button" onClick={() => focusCatchSpot(catchLog)} className="w-full text-left">
                                                            <p className="font-semibold text-slate-950 dark:text-slate-50">{catchLog.species}</p>
                                                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                                {catchLog.caught_at
                                                                    ? new Date(catchLog.caught_at).toLocaleString()
                                                                    : t('dashboard.date_not_set')}
                                                            </p>
                                                        </button>
                                                        {catchLog.is_owner ? (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {catchLog.share_url ? (
                                                                    <>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-8 rounded-xl"
                                                                            onClick={() => copyShareUrl(catchLog.share_url)}
                                                                        >
                                                                            {t('dashboard.copy_share_link')}
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-8 rounded-xl"
                                                                            onClick={() => revokeCatchLogShare(catchLog)}
                                                                        >
                                                                            {t('dashboard.revoke_share_link')}
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-8 rounded-xl"
                                                                        onClick={() => shareCatchLog(catchLog)}
                                                                    >
                                                                        {t('dashboard.share_private')}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </div>
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
                                                    <div
                                                        key={`public-spot-${catchLog.id}`}
                                                        className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-teal-500 dark:hover:bg-slate-900"
                                                    >
                                                        <button type="button" onClick={() => focusCatchSpot(catchLog)} className="w-full text-left">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <p className="font-semibold text-slate-950 dark:text-slate-50">{catchLog.species}</p>
                                                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                                    {catchLog.is_owner ? t('dashboard.yours') : (catchLog.owner_name ?? 'NautiBite')}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                                {catchLog.caught_at
                                                                    ? new Date(catchLog.caught_at).toLocaleString()
                                                                    : t('dashboard.date_not_set')}
                                                            </p>
                                                        </button>
                                                        {catchLog.is_owner ? (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {catchLog.share_url ? (
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-8 rounded-xl"
                                                                        onClick={() => copyShareUrl(catchLog.share_url)}
                                                                    >
                                                                        {t('dashboard.copy_share_link')}
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-8 rounded-xl"
                                                                        onClick={() => shareCatchLog(catchLog)}
                                                                    >
                                                                        {t('dashboard.share_private')}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </div>
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
                                                <div
                                                    key={`route-library-${navigationRoute.id}`}
                                                    className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-teal-500 dark:hover:bg-slate-900"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => requestRouteGuidance(navigationRoute)}
                                                        className="w-full text-left"
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <p className="font-semibold text-slate-950 dark:text-slate-50">{navigationRoute.name}</p>
                                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                                {navigationRoute.is_owner
                                                                    ? t('dashboard.yours')
                                                                    : (navigationRoute.owner_name ?? 'NautiBite')}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                                            {t('dashboard.route_points', { count: navigationRoute.point_count })}
                                                        </p>
                                                    </button>
                                                    {(navigationRoute.can_manage ?? navigationRoute.is_owner) ? (
                                                        <div className="mt-3 flex items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 rounded-xl"
                                                                onClick={() => openRouteEditDialog(navigationRoute)}
                                                            >
                                                                {t('dashboard.edit')}
                                                            </Button>
                                                            {navigationRoute.share_url ? (
                                                                <>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-8 rounded-xl"
                                                                        onClick={() => copyShareUrl(navigationRoute.share_url)}
                                                                    >
                                                                        {t('dashboard.copy_share_link')}
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-8 rounded-xl"
                                                                        onClick={() => revokeNavigationRouteShare(navigationRoute)}
                                                                    >
                                                                        {t('dashboard.revoke_share_link')}
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-8 rounded-xl"
                                                                    onClick={() => shareNavigationRoute(navigationRoute)}
                                                                >
                                                                    {t('dashboard.share_private')}
                                                                </Button>
                                                            )}
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                                                onClick={() => openRouteDeleteDialog(navigationRoute)}
                                                            >
                                                                {t('dashboard.delete')}
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>
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
                            className="h-11 w-11 rounded-full text-amber-700 shadow-lg md:h-12 md:w-12 dark:text-amber-300"
                            onClick={() => setBugReportDialogOpen(true)}
                            title={t('dashboard.bug_report_title')}
                        >
                            <Bug className="size-5" />
                        </Button>

                        <Button
                            type="button"
                            size="icon"
                            variant={isFollowModeActive ? 'default' : 'secondary'}
                            className={`h-11 w-11 rounded-full shadow-lg md:h-12 md:w-12 ${isFollowModeActive ? 'bg-teal-700 text-white hover:bg-teal-600' : ''}`}
                            onClick={toggleFollowMode}
                            title={isFollowModeActive ? t('dashboard.follow_mode_on') : t('dashboard.follow_mode_off')}
                        >
                            <Navigation className="size-5" />
                        </Button>

                        <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-11 w-11 rounded-full shadow-lg md:h-12 md:w-12"
                            onClick={() => {
                                setFollowPausedByUser(false);
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

                    {routeEditModeRouteId ? (
                        <div className="pointer-events-auto absolute top-4 right-3 z-[530] w-[min(92vw,360px)] rounded-2xl border border-white/70 bg-white/92 p-3 shadow-xl backdrop-blur md:right-5">
                            <p className="text-sm font-semibold text-slate-900">Route fix mode</p>
                            {(() => {
                                const hasStartAnchor = Boolean(routeEditSelection);
                                const hasBothAnchors = hasStartAnchor && routeEditSelection![0] !== routeEditSelection![1];
                                const hasDraw = routeEditDrawPoints.length > 0;
                                const currentStep = !hasStartAnchor ? 1 : !hasBothAnchors ? 2 : 3;

                                return (
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-semibold">
                                        <div
                                            className={`rounded-lg px-2 py-1 text-center ${currentStep === 1 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                        >
                                            1 Start
                                        </div>
                                        <div
                                            className={`rounded-lg px-2 py-1 text-center ${currentStep === 2 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                        >
                                            2 Draw
                                        </div>
                                        <div
                                            className={`rounded-lg px-2 py-1 text-center ${currentStep === 3 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                                        >
                                            3 End
                                        </div>
                                        <div className="col-span-3 mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
                                            {!hasStartAnchor
                                                ? 'Step 1: click the route or orange marker to set START anchor.'
                                                : !hasDraw
                                                  ? 'Step 2: click on map to draw replacement path points.'
                                                  : !hasBothAnchors
                                                    ? 'Step 3: click route/orange marker again to set END anchor.'
                                                    : 'Ready: click Apply replace, then Save route.'}
                                        </div>
                                    </div>
                                );
                            })()}
                            <p className="mt-1 text-xs text-slate-600">
                                Tap route for start anchor, tap map to draw replacement, tap route for end anchor, then apply.
                            </p>
                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                {routeEditSelection
                                    ? `Selected segment: ${Math.min(routeEditSelection[0], routeEditSelection[1])} -> ${Math.max(routeEditSelection[0], routeEditSelection[1])}`
                                    : 'No segment selected yet'}
                            </div>
                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                Drawn points: {routeEditDrawPoints.length}
                            </div>
                            {routeSubmitError ? <div className="mt-2 text-xs text-amber-700">{routeSubmitError}</div> : null}
                            {!hasRouteEditTwoAnchors ? (
                                <div className="mt-2 text-xs text-amber-700">Pick a different END anchor on the route to enable Apply replace.</div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => setRouteEditSelection(null)}>
                                    Clear pick
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRouteEditDrawPoints((current) => current.slice(0, -1))}
                                    disabled={routeEditDrawPoints.length === 0}
                                >
                                    Undo draw
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRouteEditDrawPoints([])}
                                    disabled={routeEditDrawPoints.length === 0}
                                >
                                    Clear draw
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={autoPickRouteEditEndAnchor}
                                    disabled={
                                        !routeEditSelection || routeEditSelection[0] !== routeEditSelection[1] || routeEditDrawPoints.length === 0
                                    }
                                >
                                    Auto end anchor
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={applyRouteReplacementSegment}
                                    disabled={!hasRouteEditTwoAnchors || routeEditDrawPoints.length === 0}
                                >
                                    Apply replace
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={removeSelectedRouteSegment} disabled={!routeEditSelection}>
                                    Remove segment
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={cancelRouteGeometryEdit} disabled={isSavingRoute}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={saveRouteGeometryEdit}
                                    disabled={isSavingRoute || routeEditDraftPoints.length < 2}
                                >
                                    {isSavingRoute ? t('common.saving') : 'Save route'}
                                </Button>
                            </div>
                        </div>
                    ) : null}

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
                            className="top-auto bottom-0 left-1/2 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900"
                        >
                            <div className="relative flex max-h-[92dvh] min-h-0 flex-col overflow-hidden p-5 sm:max-h-[90vh] sm:p-6">
                                <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />

                                {dialogStep === 'action' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {t('dashboard.what_do')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {t('dashboard.what_do_copy')}
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="mt-6 grid gap-3 overflow-y-auto pr-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (spotLimitReached) {
                                                        setSubmitError(t('dashboard.pro_spot_limit_reached', { count: subscription.limits.spots }));
                                                        setDialogOpen(false);
                                                        return;
                                                    }
                                                    setDialogStep('location-mode');
                                                }}
                                                className={`rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50 ${
                                                    spotLimitReached ? 'opacity-70' : ''
                                                }`}
                                            >
                                                <p className="font-semibold text-slate-950">{t('dashboard.add_a_fish')}</p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {spotLimitReached
                                                        ? t('dashboard.pro_spot_limit_reached', { count: subscription.limits.spots })
                                                        : t('dashboard.add_a_fish_copy')}
                                                </p>
                                            </button>

                                            {canRecordRoutes ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (routeLimitReached) {
                                                            setSubmitError(
                                                                t('dashboard.pro_route_limit_reached', { count: subscription.limits.routes }),
                                                            );
                                                            setDialogOpen(false);
                                                            return;
                                                        }

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
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        {routeLimitReached
                                                            ? t('dashboard.pro_route_limit_reached', { count: subscription.limits.routes })
                                                            : t('dashboard.start_navigation_copy')}
                                                    </p>
                                                </button>
                                            ) : null}
                                        </div>
                                    </>
                                ) : null}

                                {dialogStep === 'navigation' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {t('dashboard.navigation_later')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {t('dashboard.navigation_later_copy')}
                                            </DialogDescription>
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
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {t('dashboard.where_caught')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {t('dashboard.where_caught_copy')}
                                            </DialogDescription>
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
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {t('dashboard.confirm_location')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {t('dashboard.confirm_location_copy')}
                                            </DialogDescription>
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
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {t('dashboard.details_copy')}
                                            </DialogDescription>
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
                                                    {form.processing
                                                        ? t('common.saving')
                                                        : activeCatch
                                                          ? t('dashboard.save_changes')
                                                          : t('dashboard.save_fish')}
                                                </Button>
                                            </div>
                                        </form>
                                    </>
                                ) : null}

                                {dialogStep === 'delete' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {t('dashboard.delete_pin')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {t('dashboard.delete_pin_copy')}
                                            </DialogDescription>
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
                                        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                                            {successTitle}
                                        </h3>
                                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{successMessage}</p>
                                    </div>
                                ) : null}

                                {dialogStep === 'details' && form.processing ? (
                                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[1.75rem] bg-white/92 text-center backdrop-blur">
                                        <div className="flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                                            <LoaderCircle className="size-8 animate-spin" />
                                        </div>
                                        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                                            {t('dashboard.saving_fish')}
                                        </h3>
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
                        <DialogContent className="top-auto bottom-0 left-1/2 max-h-[92dvh] w-[calc(100%-1rem)] max-w-none translate-x-[-50%] translate-y-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-slate-200 bg-white p-0 sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:translate-y-[-50%] sm:rounded-[1.75rem] dark:border-slate-700 dark:bg-slate-900">
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
                                                    count: routeDialogMode === 'create' ? activeRoutePoints.length : (activeRoute?.point_count ?? 0),
                                                })}
                                            </div>

                                            {routeDialogMode === 'edit' ? (
                                                <Button type="button" variant="outline" onClick={startRouteGeometryEdit}>
                                                    Fix route on map
                                                </Button>
                                            ) : null}

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
                                                <Button type="button" onClick={saveRoute} disabled={isSavingRoute}>
                                                    {isSavingRoute
                                                        ? t('common.saving')
                                                        : routeDialogMode === 'create'
                                                          ? t('dashboard.save_route_button')
                                                          : t('dashboard.save_changes')}
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                ) : null}

                                {routeDialogMode === 'delete' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl tracking-tight text-slate-950 dark:text-slate-50">
                                                {t('dashboard.delete_route')}
                                            </DialogTitle>
                                            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {t('dashboard.delete_route_copy')}
                                            </DialogDescription>
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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
            {children}
            {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </label>
    );
}

function formatBugReportStatus(status: BugReport['status'], t: (key: string) => string) {
    return t(`dashboard.bug_status_${status}`);
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
            className={`rounded-[1.35rem] border border-white/70 bg-white/88 p-4 text-left shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-950/88 ${onClick ? 'transition hover:-translate-y-0.5 hover:border-teal-200 dark:hover:border-teal-700' : ''} ${className}`}
        >
            <Icon className="size-4 text-teal-700 dark:text-teal-300" />
            <p className={`mt-3 font-semibold text-slate-950 dark:text-slate-50 ${compact ? 'text-sm' : 'text-2xl'}`}>{value}</p>
            <p className="mt-1 text-xs tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">{label}</p>
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
    let bestMatch: {
        distance: number;
        nearestPoint: [number, number];
        rejoinBearing: number;
        onCourse: boolean;
    } | null = null;

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
    const x = Math.cos(startLatRad) * Math.sin(endLatRad) - Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(deltaLngRad);

    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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

function formatDurationShort(seconds: number) {
    const safeSeconds = Math.max(0, Math.round(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
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

function normalizeDegrees(value: number) {
    return ((value % 360) + 360) % 360;
}

function interpolateCircularDegrees(from: number, to: number, factor: number) {
    const shortestDiff = shortestCircularDiff(from, to);

    return normalizeDegrees(from + shortestDiff * factor);
}

function shortestCircularDiff(from: number, to: number) {
    return ((to - from + 540) % 360) - 180;
}

function limitCircularStep(from: number, to: number, maxStepDegrees: number) {
    const diff = shortestCircularDiff(from, to);
    const clamped = Math.max(-maxStepDegrees, Math.min(maxStepDegrees, diff));

    return normalizeDegrees(from + clamped);
}

function extractDeviceHeading(event: DeviceOrientationEvent) {
    const iosHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;

    if (typeof iosHeading === 'number' && Number.isFinite(iosHeading)) {
        return normalizeDegrees(iosHeading);
    }

    if (typeof event.alpha !== 'number' || !Number.isFinite(event.alpha)) {
        return null;
    }

    const rawHeading = 360 - event.alpha;
    const windowWithOrientation = window as Window & { orientation?: number };
    const screenAngle =
        typeof window.screen.orientation?.angle === 'number'
            ? window.screen.orientation.angle
            : typeof windowWithOrientation.orientation === 'number'
              ? windowWithOrientation.orientation
              : 0;

    return normalizeDegrees(rawHeading + screenAngle);
}

function formatWindLabel(speedKmh: number | null | undefined, directionDeg: number | null | undefined) {
    if (speedKmh === null || speedKmh === undefined || !Number.isFinite(speedKmh)) {
        return '--';
    }

    if (directionDeg === null || directionDeg === undefined || !Number.isFinite(directionDeg)) {
        return formatSpeedKmh(speedKmh);
    }

    return `${formatSpeedKmh(speedKmh)} • ${formatBearing(directionDeg)}`;
}

function formatTideTimeAndHeight(timeIso: string | null | undefined, heightM: number | null | undefined) {
    if (!timeIso) {
        return '--';
    }

    const parsed = new Date(timeIso);
    if (Number.isNaN(parsed.getTime())) {
        return '--';
    }

    const time = parsed.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false });
    const height = heightM !== null && heightM !== undefined && Number.isFinite(heightM) ? ` (${heightM.toFixed(2)} m)` : '';

    return `${time}${height}`;
}

function getUpcomingTideEvent(tide: MarineConditionsPayload['tide'] | null | undefined) {
    if (!tide) {
        return null;
    }

    const candidates = [
        { type: tide.next_event_type ?? null, at: tide.next_event_at ?? null, height: tide.next_event_m ?? null },
        { type: 'high' as const, at: tide.next_high_at, height: tide.next_high_m },
        { type: 'low' as const, at: tide.next_low_at, height: tide.next_low_m },
    ]
        .filter((event): event is { type: 'high' | 'low'; at: string; height: number | null | undefined } => {
            if (event.type !== 'high' && event.type !== 'low') {
                return false;
            }

            if (!event.at) {
                return false;
            }

            const timestamp = new Date(event.at).getTime();

            return Number.isFinite(timestamp) && timestamp > Date.now() - 2 * 60 * 1000;
        })
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return candidates[0] ?? null;
}

function formatTideState(state: 'rising' | 'falling' | 'slack' | null | undefined, t: (key: string) => string) {
    if (!state) {
        return '--';
    }

    if (state === 'rising') {
        return t('dashboard.tide_rising');
    }

    if (state === 'falling') {
        return t('dashboard.tide_falling');
    }

    return t('dashboard.tide_slack');
}

function formatTideEventLabel(type: 'high' | 'low' | null | undefined, t: (key: string) => string) {
    if (type === 'high') {
        return t('dashboard.tide_high');
    }

    if (type === 'low') {
        return t('dashboard.tide_low');
    }

    return '--';
}

async function requestDeviceHeadingPermission() {
    const withPermission = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof withPermission.requestPermission !== 'function') {
        return true;
    }

    try {
        const result = await withPermission.requestPermission();
        return result === 'granted';
    } catch {
        return false;
    }
}

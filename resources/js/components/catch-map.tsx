import { useTranslator } from '@/lib/i18n';
import { type CatchLog, type MapBounds, type MapFocusRequest, type NavigationRoute } from '@/types';
import { App as CapacitorApp } from '@capacitor/app';
import { BackgroundGeolocation, type Location as BackgroundLocation } from '@capgo/background-geolocation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L, { Icon, LeafletMouseEvent } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents, WMSTileLayer } from 'react-leaflet';
import { Fish, Layers3 } from 'lucide-react';

interface CatchMapProps {
    catchLogs: CatchLog[];
    navigationRoutes: NavigationRoute[];
    activeRoutePoints: [number, number][];
    positionOverride: [number, number] | null;
    selectedPosition: [number, number] | null;
    allowTapSelection: boolean;
    onSelectPosition: (position: [number, number]) => void;
    onClearSelection: () => void;
    onCurrentPositionChange: (sample: { position: [number, number]; accuracy: number; recordedAt: string } | null) => void;
    onCurrentSpeedChange: (speedKmh: number | null) => void;
    onInteractionChange: (isInteracting: boolean) => void;
    recenterToCurrentSignal: number;
    externalFocusRequest: MapFocusRequest | null;
    onInitialLoadChange: (isLoading: boolean) => void;
    onBoundsChange: (bounds: MapBounds) => void;
    onLongPress: (position: [number, number]) => void;
    onEditCatch: (catchLog: CatchLog) => void;
    onDeleteCatch: (catchLog: CatchLog) => void;
    onEditRoute: (route: NavigationRoute) => void;
    onDeleteRoute: (route: NavigationRoute) => void;
    onStartRouteGuidance: (route: NavigationRoute) => void;
    canRecordRoutes: boolean;
    canUseSatellite: boolean;
    onSatelliteUsageTick: (seconds: number) => void;
    keepTrackingInBackground: boolean;
    activeGuidanceRouteId: number | null;
    guidanceNearestPoint: [number, number] | null;
    isGuidanceActive: boolean;
    routeEditRouteId?: number | null;
    routeEditPoints?: [number, number][];
    routeEditSelectionPoints?: [number, number][];
    routeEditDrawPoints?: [number, number][];
    onRouteEditMapPick?: (routeId: number, position: [number, number]) => void;
}

const defaultCenter: [number, number] = [38.7223, -9.1393];
const satelliteKey = import.meta.env.VITE_MAPTILER_KEY;
const emodnetDepthWmsUrl = 'https://ows.emodnet-bathymetry.eu/wms?';
const emodnetDepthSampleUrl = 'https://rest.emodnet-bathymetry.eu/depth_sample';
const shallowRiskSld = `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NamedLayer>
    <Name>emodnet:mean_rainbowcolour</Name>
    <UserStyle>
      <FeatureTypeStyle>
        <Rule>
          <RasterSymbolizer>
            <ColorMap type="intervals">
              <ColorMapEntry color="#000000" quantity="0" opacity="0" />
              <ColorMapEntry color="#111827" quantity="1" opacity="0.9" />
              <ColorMapEntry color="#7c3aed" quantity="2" opacity="0.78" />
              <ColorMapEntry color="#06b6d4" quantity="3" opacity="0.68" />
              <ColorMapEntry color="#000000" quantity="10000" opacity="0" />
            </ColorMap>
          </RasterSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`;
type BaseLayerMode = 'street' | 'nautical' | 'satellite';
const defaultLayerOrder: BaseLayerMode[] = ['street', 'nautical'];
type PositionCoordsLike = {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed?: number | null;
};

const SPEED_NOISE_FLOOR_KMH = 1.8;
const MIN_MOVEMENT_FOR_SPEED_METERS = 2;
const MAX_ACCURACY_FOR_DERIVED_SPEED_METERS = 80;
const MAX_TRACK_SPIKE_SPEED_KMH = 220;
const MAX_TRACK_SPIKE_DISTANCE_METERS = 300;
const RECENT_SPEED_HOLD_MS = 3500;
const ACTIVE_TRACKING_INTERVAL_MS = 1000;
const PASSIVE_TRACKING_INTERVAL_MS = 3000;
const MAP_TILE_BUFFER = 3;
const parseCoordinate = (value: string | number | null | undefined): number => {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value !== 'string') {
        return Number.NaN;
    }

    return Number(value.replace(',', '.'));
};

export function CatchMap({
    catchLogs,
    navigationRoutes,
    activeRoutePoints,
    positionOverride,
    selectedPosition,
    allowTapSelection,
    onSelectPosition,
    onClearSelection,
    onCurrentPositionChange,
    onCurrentSpeedChange,
    onInteractionChange,
    recenterToCurrentSignal,
    externalFocusRequest,
    onInitialLoadChange,
    onBoundsChange,
    onLongPress,
    onEditCatch,
    onDeleteCatch,
    onEditRoute,
    onDeleteRoute,
    onStartRouteGuidance,
    canRecordRoutes,
    canUseSatellite,
    onSatelliteUsageTick,
    keepTrackingInBackground,
    activeGuidanceRouteId,
    guidanceNearestPoint,
    isGuidanceActive,
    routeEditRouteId = null,
    routeEditPoints = [],
    routeEditSelectionPoints = [],
    routeEditDrawPoints = [],
    onRouteEditMapPick,
}: CatchMapProps) {
    const { t } = useTranslator();
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
    const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
    const [baseLayer, setBaseLayer] = useState<BaseLayerMode>('nautical');
    const [tileRefreshKey, setTileRefreshKey] = useState(0);
    const [showDepthLayer, setShowDepthLayer] = useState(false);
    const [isNarrowBrowserViewport, setIsNarrowBrowserViewport] = useState(false);
    const [currentDepthMeters, setCurrentDepthMeters] = useState<number | null>(null);
    const [isDepthLoading, setIsDepthLoading] = useState(false);
    const [focusRequest, setFocusRequest] = useState<{ center: [number, number]; key: number } | null>(null);
    const hasAutoCenteredRef = useRef(false);
    const loadDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const depthAbortControllerRef = useRef<AbortController | null>(null);
    const currentPositionHandlerRef = useRef(onCurrentPositionChange);
    const currentSpeedHandlerRef = useRef(onCurrentSpeedChange);
    const satelliteUsageHandlerRef = useRef(onSatelliteUsageTick);
    const lastSpeedSampleRef = useRef<{ position: [number, number]; timestamp: number } | null>(null);
    const lastReportedSpeedRef = useRef<{ speedKmh: number; timestamp: number } | null>(null);

    useEffect(() => {
        if (Capacitor.isNativePlatform() || typeof window === 'undefined') {
            setIsNarrowBrowserViewport(false);
            return;
        }

        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const updateViewportMatch = () => setIsNarrowBrowserViewport(mediaQuery.matches);

        updateViewportMatch();
        mediaQuery.addEventListener('change', updateViewportMatch);

        return () => mediaQuery.removeEventListener('change', updateViewportMatch);
    }, []);

    useEffect(() => {
        currentPositionHandlerRef.current = onCurrentPositionChange;
    }, [onCurrentPositionChange]);

    useEffect(() => {
        currentSpeedHandlerRef.current = onCurrentSpeedChange;
    }, [onCurrentSpeedChange]);

    useEffect(() => {
        satelliteUsageHandlerRef.current = onSatelliteUsageTick;
    }, [onSatelliteUsageTick]);

    const availableLayerOrder = useMemo<BaseLayerMode[]>(
        () => (satelliteKey && canUseSatellite ? [...defaultLayerOrder, 'satellite'] : defaultLayerOrder),
        [canUseSatellite],
    );

    useEffect(() => {
        const shouldKeepScreenAwake = keepTrackingInBackground || isGuidanceActive;

        if (!shouldKeepScreenAwake) {
            void KeepAwake.allowSleep().catch(() => undefined);
            return;
        }

        void KeepAwake.keepAwake().catch(() => undefined);

        return () => {
            void KeepAwake.allowSleep().catch(() => undefined);
        };
    }, [isGuidanceActive, keepTrackingInBackground]);

    useEffect(() => {
        if (baseLayer === 'satellite' && (!satelliteKey || !canUseSatellite)) {
            setBaseLayer('nautical');
        }
    }, [baseLayer, canUseSatellite]);

    useEffect(() => {
        if (baseLayer !== 'satellite') {
            return;
        }

        const interval = window.setInterval(() => {
            satelliteUsageHandlerRef.current(60);
        }, 60000);

        return () => window.clearInterval(interval);
    }, [baseLayer]);

    const catchPoints = catchLogs
        .filter((catchLog) => catchLog.latitude && catchLog.longitude)
        .map((catchLog) => ({
            ...catchLog,
            latitude: parseCoordinate(catchLog.latitude),
            longitude: parseCoordinate(catchLog.longitude),
        }))
        .filter((catchLog) => Number.isFinite(catchLog.latitude) && Number.isFinite(catchLog.longitude));

    useEffect(() => {
        let webWatchId: number | null = null;
        let nativeWatchId: string | null = null;
        let backgroundWatchActive = false;
        let cancelled = false;
        let isAppActive = true;
        const isActiveTrackingMode = keepTrackingInBackground || isGuidanceActive;

        const shouldTrack = () => !cancelled && (isAppActive || isActiveTrackingMode);

        const clearTracking = () => {
            if (webWatchId !== null) {
                navigator.geolocation.clearWatch(webWatchId);
                webWatchId = null;
            }

            if (nativeWatchId) {
                void Geolocation.clearWatch({ id: nativeWatchId });
                nativeWatchId = null;
            }

            if (backgroundWatchActive) {
                void BackgroundGeolocation.stop();
                backgroundWatchActive = false;
            }

            currentSpeedHandlerRef.current(null);
        };

        const applyPosition = (coords: PositionCoordsLike, positionTimestamp?: number | null) => {
            if (!shouldTrack()) {
                return;
            }

            const nextPosition: [number, number] = [coords.latitude, coords.longitude];
            const timestamp = typeof positionTimestamp === 'number' && Number.isFinite(positionTimestamp) ? positionTimestamp : Date.now();
            let derivedSpeedKmh: number | null = null;
            const previousSpeedSample = lastSpeedSampleRef.current;
            const recordedAt = new Date(timestamp).toISOString();

            if (previousSpeedSample) {
                const elapsedMilliseconds = timestamp - previousSpeedSample.timestamp;

                if (elapsedMilliseconds > 0) {
                    const distanceMeters = calculateDistanceMeters(previousSpeedSample.position, nextPosition);
                    const nextSpeedKmh = (distanceMeters / elapsedMilliseconds) * 3600;
                    const isLikelySpike = distanceMeters >= MAX_TRACK_SPIKE_DISTANCE_METERS && nextSpeedKmh >= MAX_TRACK_SPIKE_SPEED_KMH;

                    if (isLikelySpike) {
                        return;
                    }

                    if (distanceMeters < MIN_MOVEMENT_FOR_SPEED_METERS) {
                        derivedSpeedKmh = 0;
                    } else if (coords.accuracy <= MAX_ACCURACY_FOR_DERIVED_SPEED_METERS) {
                        derivedSpeedKmh = nextSpeedKmh;
                    } else {
                        derivedSpeedKmh = null;
                    }
                }
            }

            lastSpeedSampleRef.current = { position: nextPosition, timestamp };
            setCurrentPosition(nextPosition);
            setLocationAccuracy(Math.round(coords.accuracy));
            currentPositionHandlerRef.current({
                position: nextPosition,
                accuracy: Math.round(coords.accuracy),
                recordedAt,
            });

            const nativeSpeedKmh =
                typeof coords.speed === 'number' && Number.isFinite(coords.speed) && coords.speed > 0.15 ? Math.max(coords.speed * 3.6, 0) : null;
            const rawSpeedKmh = nativeSpeedKmh ?? derivedSpeedKmh;
            let smoothedSpeedKmh = rawSpeedKmh !== null && rawSpeedKmh < SPEED_NOISE_FLOOR_KMH ? 0 : rawSpeedKmh;

            if (smoothedSpeedKmh === null && lastReportedSpeedRef.current && timestamp - lastReportedSpeedRef.current.timestamp <= RECENT_SPEED_HOLD_MS) {
                smoothedSpeedKmh = lastReportedSpeedRef.current.speedKmh;
            }

            if (smoothedSpeedKmh !== null) {
                lastReportedSpeedRef.current = { speedKmh: smoothedSpeedKmh, timestamp };
            }

            currentSpeedHandlerRef.current(smoothedSpeedKmh);

            if (!hasAutoCenteredRef.current) {
                hasAutoCenteredRef.current = true;
                setFocusRequest({
                    center: nextPosition,
                    key: Date.now(),
                });
            }
        };

        const applyBackgroundLocation = (location: BackgroundLocation) => {
            applyPosition(
                {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy,
                    speed: location.speed,
                },
                location.time,
            );
        };

        const startWebTracking = () => {
            if (!shouldTrack()) {
                return;
            }

            if (!('geolocation' in navigator)) {
                currentPositionHandlerRef.current(null);
                currentSpeedHandlerRef.current(null);
                return;
            }

            if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                currentPositionHandlerRef.current(null);
                currentSpeedHandlerRef.current(null);
                return;
            }

            const requestPosition = (enableHighAccuracy = true) => {
                navigator.geolocation.getCurrentPosition(
                    ({ coords, timestamp }) => applyPosition(coords, timestamp),
                    () => undefined,
                    {
                        enableHighAccuracy,
                        maximumAge: isActiveTrackingMode ? 0 : 2000,
                        timeout: isActiveTrackingMode ? 8000 : 12000,
                    },
                );
            };

            requestPosition();

            webWatchId = navigator.geolocation.watchPosition(
                ({ coords, timestamp }) => {
                    applyPosition(coords, timestamp);
                },
                (error) => {
                    if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
                        requestPosition(false);
                    }
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: isActiveTrackingMode ? 0 : 2000,
                    timeout: isActiveTrackingMode ? 8000 : 12000,
                },
            );
        };

        const startNativeBackgroundTracking = async () => {
            if (!shouldTrack()) {
                return;
            }

            try {
                await BackgroundGeolocation.start(
                    {
                        backgroundTitle: 'Fishmap navigation',
                        backgroundMessage: 'Fishmap is recording your position for navigation.',
                        requestPermissions: true,
                        stale: false,
                        distanceFilter: 0,
                    },
                    (position, error) => {
                        if (error) {
                            currentPositionHandlerRef.current(null);
                            currentSpeedHandlerRef.current(null);
                            return;
                        }

                        if (!shouldTrack() || !position) {
                            return;
                        }

                        applyBackgroundLocation(position);
                    },
                );
                backgroundWatchActive = true;
            } catch {
                startWebTracking();
            }
        };

        const startNativeTracking = async () => {
            if (!shouldTrack()) {
                return;
            }

            try {
                const permission = await Geolocation.requestPermissions();

                if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
                    currentPositionHandlerRef.current(null);
                    currentSpeedHandlerRef.current(null);
                    return;
                }

                const current = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: isActiveTrackingMode ? 8000 : 12000,
                    maximumAge: isActiveTrackingMode ? 0 : 2000,
                });

                if (!cancelled) {
                    applyPosition(current.coords, current.timestamp);
                }

                nativeWatchId = await Geolocation.watchPosition(
                    {
                        enableHighAccuracy: true,
                        timeout: isActiveTrackingMode ? ACTIVE_TRACKING_INTERVAL_MS : 10000,
                        maximumAge: isActiveTrackingMode ? 0 : 2000,
                        interval: isActiveTrackingMode ? ACTIVE_TRACKING_INTERVAL_MS : PASSIVE_TRACKING_INTERVAL_MS,
                        minimumUpdateInterval: isActiveTrackingMode ? ACTIVE_TRACKING_INTERVAL_MS : PASSIVE_TRACKING_INTERVAL_MS,
                    },
                    (position) => {
                        if (!shouldTrack() || !position) {
                            return;
                        }

                        applyPosition(position.coords, position.timestamp);
                    },
                );

                if (!shouldTrack() && nativeWatchId) {
                    void Geolocation.clearWatch({ id: nativeWatchId });
                    nativeWatchId = null;
                }
            } catch {
                startWebTracking();
            }
        };

        const startTracking = () => {
            clearTracking();

            if (!shouldTrack()) {
                return;
            }

            if (Capacitor.isNativePlatform() && isActiveTrackingMode) {
                void startNativeBackgroundTracking();
            } else if (Capacitor.isNativePlatform()) {
                void startNativeTracking();
            } else {
                startWebTracking();
            }
        };

        startTracking();

        const appStateListenerPromise = Capacitor.isNativePlatform()
            ? CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                  isAppActive = isActive;

                  if (!isAppActive) {
                      if (!isActiveTrackingMode) {
                          clearTracking();
                      }
                      return;
                  }

                  startTracking();
              })
            : null;

        return () => {
            cancelled = true;
            clearTracking();
            lastSpeedSampleRef.current = null;
            lastReportedSpeedRef.current = null;

            if (appStateListenerPromise) {
                void appStateListenerPromise.then((listener) => listener.remove());
            }
        };
    }, [isGuidanceActive, keepTrackingInBackground]);

    useEffect(() => {
        return () => {
            if (loadDelayTimer.current) {
                clearTimeout(loadDelayTimer.current);
            }

            if (depthAbortControllerRef.current) {
                depthAbortControllerRef.current.abort();
                depthAbortControllerRef.current = null;
            }
        };
    }, []);

    const displayedPosition = positionOverride ?? currentPosition;

    useEffect(() => {
        if (!showDepthLayer || !displayedPosition) {
            setIsDepthLoading(false);
            return;
        }

        const [latitude, longitude] = displayedPosition;
        const params = new URLSearchParams({
            geom: `POINT(${longitude} ${latitude})`,
        });

        if (depthAbortControllerRef.current) {
            depthAbortControllerRef.current.abort();
        }

        const controller = new AbortController();
        depthAbortControllerRef.current = controller;

        setIsDepthLoading(true);

        const timeoutId = window.setTimeout(() => {
            fetch(`${emodnetDepthSampleUrl}?${params.toString()}`, { signal: controller.signal })
                .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`Depth request failed (${response.status})`))))
                .then((payload: unknown) => {
                    if (typeof payload !== 'object' || payload === null) {
                        setCurrentDepthMeters(null);
                        return;
                    }

                    const avg = Number((payload as { avg?: unknown }).avg);
                    if (!Number.isFinite(avg) || avg <= 0 || avg > 1200) {
                        setIsDepthLoading(false);
                        return;
                    }

                    setCurrentDepthMeters(avg);
                    setIsDepthLoading(false);
                })
                .catch(() => {
                    setIsDepthLoading(false);
                });
        }, 350);

        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [displayedPosition, showDepthLayer]);

    useEffect(() => {
        onInitialLoadChange(showLoadingOverlay && !hasCompletedInitialLoad);
    }, [hasCompletedInitialLoad, onInitialLoadChange, showLoadingOverlay]);

    useEffect(() => {
        if (recenterToCurrentSignal > 0 && currentPosition) {
            setFocusRequest({
                center: currentPosition,
                key: recenterToCurrentSignal,
            });
        }
    }, [currentPosition, recenterToCurrentSignal]);

    const routeLines = navigationRoutes
        .map((route) => ({
            ...route,
            latlngs: route.points
                .map((point) => [parseCoordinate(point.latitude), parseCoordinate(point.longitude)] as [number, number])
                .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude)),
        }))
        .filter((route) => route.latlngs.length >= 2);

    const initialCenter =
        displayedPosition ?? (catchPoints.length > 0 ? ([catchPoints[0].latitude, catchPoints[0].longitude] as [number, number]) : defaultCenter);

    const displayAccuracyRadius = useMemo(() => {
        if (!displayedPosition || !locationAccuracy || locationAccuracy <= 30 || positionOverride) {
            return null;
        }

        return Math.min(Math.max(locationAccuracy / 4, 12), 40);
    }, [displayedPosition, locationAccuracy, positionOverride]);

    const cycleLayer = () => {
        const currentIndex = availableLayerOrder.indexOf(baseLayer);
        const nextLayer = availableLayerOrder[(currentIndex + 1) % availableLayerOrder.length];
        setBaseLayer(nextLayer);
    };

    const currentLayerLabel =
        baseLayer === 'street' ? t('dashboard.map_street') : baseLayer === 'nautical' ? t('dashboard.map_nautical') : t('dashboard.map_satellite');
    const requestTileLayerRefresh = useCallback(() => setTileRefreshKey((current) => current + 1), []);
    const canRenderExternalRasterOverlays = Capacitor.isNativePlatform() || !isNarrowBrowserViewport;
    const shouldRenderSeaMarks = baseLayer === 'nautical' && canRenderExternalRasterOverlays;
    const shouldRenderDepthLayer = showDepthLayer && canRenderExternalRasterOverlays;

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#0f172a]">
            <MapContainer
                center={initialCenter}
                zoom={catchPoints.length > 0 ? 8 : 11}
                scrollWheelZoom
                zoomControl={false}
                fadeAnimation={false}
                markerZoomAnimation={false}
                className="fishmap-map h-full w-full bg-[#0f172a]"
            >
                <MapViewport
                    focusRequest={externalFocusRequest ?? focusRequest}
                    refreshKey={`${baseLayer}-${showDepthLayer ? 'depth' : 'flat'}`}
                    onTileRefreshRequest={requestTileLayerRefresh}
                />
                <MapInteractionBridge onInteractionChange={onInteractionChange} />
                <MapBoundsBridge onBoundsChange={onBoundsChange} />
                <MapClickHandler allowTapSelection={allowTapSelection} onSelectPosition={onSelectPosition} onLongPress={onLongPress} />

                <TileLayer
                    key={`base-${baseLayer}-${tileRefreshKey}`}
                    attribution={
                        baseLayer === 'satellite' && satelliteKey
                            ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }
                    url={
                        baseLayer === 'satellite' && satelliteKey
                            ? `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${satelliteKey}`
                            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    }
                    keepBuffer={MAP_TILE_BUFFER}
                    updateWhenIdle={false}
                    updateWhenZooming
                    eventHandlers={{
                        loading: () => {
                            if (hasCompletedInitialLoad) {
                                return;
                            }

                            if (loadDelayTimer.current) {
                                clearTimeout(loadDelayTimer.current);
                            }

                            loadDelayTimer.current = setTimeout(() => {
                                setShowLoadingOverlay(true);
                            }, 180);
                        },
                        load: () => {
                            if (loadDelayTimer.current) {
                                clearTimeout(loadDelayTimer.current);
                                loadDelayTimer.current = null;
                            }

                            setShowLoadingOverlay(false);
                            setHasCompletedInitialLoad(true);
                        },
                    }}
                />

                {shouldRenderSeaMarks ? (
                    <TileLayer
                        key={`seamark-${tileRefreshKey}`}
                        attribution='&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> seamarks'
                        url="https://t1.openseamap.org/seamark/{z}/{x}/{y}.png"
                        keepBuffer={MAP_TILE_BUFFER}
                        updateWhenIdle={false}
                        updateWhenZooming
                    />
                ) : null}
                {shouldRenderDepthLayer ? (
                    <>
                        <WMSTileLayer
                            key={`depth-raster-${tileRefreshKey}`}
                            url={emodnetDepthWmsUrl}
                            layers="emodnet:mean_rainbowcolour"
                            format="image/png"
                            transparent
                            opacity={0.3}
                            version="1.1.1"
                            attribution='Bathymetry: <a href="https://emodnet.ec.europa.eu/en/bathymetry">EMODnet</a>'
                        />
                        <WMSTileLayer
                            key={`depth-risk-${tileRefreshKey}`}
                            url={emodnetDepthWmsUrl}
                            layers="emodnet:mean_rainbowcolour"
                            format="image/png"
                            transparent
                            opacity={1}
                            version="1.1.1"
                            params={{
                                sld_body: shallowRiskSld,
                            }}
                        />
                        <WMSTileLayer
                            key={`depth-contours-${tileRefreshKey}`}
                            url={emodnetDepthWmsUrl}
                            layers="emodnet:contours"
                            format="image/png"
                            transparent
                            opacity={0.68}
                            version="1.1.1"
                        />
                    </>
                ) : null}

                {displayedPosition ? (
                    <>
                        {displayAccuracyRadius ? (
                            <CircleMarker
                                center={displayedPosition}
                                radius={displayAccuracyRadius}
                                pathOptions={{
                                    color: '#38bdf8',
                                    fillColor: '#38bdf8',
                                    fillOpacity: 0.14,
                                    weight: 1,
                                }}
                            />
                        ) : null}

                        <CircleMarker
                            center={displayedPosition}
                            radius={10}
                            pathOptions={{
                                color: '#0f172a',
                                fillColor: '#38bdf8',
                                fillOpacity: 0.95,
                                weight: 2,
                            }}
                        >
                            <Popup>
                                {positionOverride
                                    ? t('dashboard.simulated_position')
                                    : locationAccuracy
                                    ? t('dashboard.you_are_here_accuracy', { accuracy: locationAccuracy })
                                    : t('dashboard.you_are_here')}
                            </Popup>
                            {showDepthLayer ? (
                                <Tooltip permanent direction="top" offset={[0, -12]}>
                                    <span className="text-[11px] font-semibold">
                                        {t('dashboard.depth')}:{' '}
                                        {currentDepthMeters !== null ? `${currentDepthMeters.toFixed(1)} m` : isDepthLoading ? '...' : 'n/a'}
                                    </span>
                                </Tooltip>
                            ) : null}
                        </CircleMarker>
                    </>
                ) : null}

                {routeLines.map((route) => (
                    <Polyline
                        key={`route-${route.id}`}
                        positions={routeEditRouteId === route.id && routeEditPoints.length >= 2 ? routeEditPoints : route.latlngs}
                        pathOptions={{
                            color:
                                routeEditRouteId === route.id
                                    ? '#ef4444'
                                    : route.id === activeGuidanceRouteId
                                      ? '#14b8a6'
                                      : route.is_owner
                                        ? '#f59e0b'
                                        : '#60a5fa',
                            weight: routeEditRouteId === route.id ? 6 : route.id === activeGuidanceRouteId ? 6 : 4,
                            opacity: routeEditRouteId === route.id ? 0.98 : route.id === activeGuidanceRouteId ? 0.95 : 0.8,
                        }}
                        eventHandlers={{
                            click: (event) => {
                                if (routeEditRouteId === route.id && onRouteEditMapPick) {
                                    onRouteEditMapPick(route.id, [event.latlng.lat, event.latlng.lng]);
                                    if (event.originalEvent) {
                                        L.DomEvent.stopPropagation(event.originalEvent);
                                    }
                                }
                            },
                        }}
                    >
                        <Popup className="fishmap-popup fishmap-popup--route">
                            <div className="fishmap-popup-card">
                                <div className="space-y-1">
                                    <p className="fishmap-popup-title">{route.name}</p>
                                    <p className="fishmap-popup-copy">
                                        {t('dashboard.route_points', { count: route.point_count })}
                                    </p>
                                    {route.owner_name && !route.is_owner ? (
                                        <p className="fishmap-popup-copy">{t('dashboard.shared_by', { name: route.owner_name })}</p>
                                    ) : null}
                                </div>

                                <div className="fishmap-popup-actions">
                                    <button
                                        type="button"
                                        className="fishmap-popup-button fishmap-popup-button--secondary"
                                        onClick={(event) => {
                                            event.currentTarget
                                                .closest('.leaflet-popup')
                                                ?.querySelector<HTMLAnchorElement>('.leaflet-popup-close-button')
                                                ?.click();
                                            onStartRouteGuidance(route);
                                        }}
                                    >
                                        {t('dashboard.guide_route')}
                                    </button>
                                    {(route.can_manage ?? route.is_owner) && canRecordRoutes ? (
                                        <>
                                            <button
                                                type="button"
                                                className="fishmap-popup-button fishmap-popup-button--primary"
                                                onClick={() => onEditRoute(route)}
                                            >
                                                {t('dashboard.edit')}
                                            </button>
                                            <button
                                                type="button"
                                                className="fishmap-popup-button fishmap-popup-button--danger"
                                                onClick={() => onDeleteRoute(route)}
                                            >
                                                {t('dashboard.delete')}
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        </Popup>
                    </Polyline>
                ))}

                {activeRoutePoints.length >= 2 ? (
                    <Polyline
                        positions={activeRoutePoints}
                        pathOptions={{
                            color: '#22c55e',
                            weight: 5,
                            opacity: 0.95,
                        }}
                    />
                ) : null}

                {routeEditSelectionPoints.map((selectionPoint, index) => (
                    <CircleMarker
                        key={`route-edit-selection-${index}`}
                        center={selectionPoint}
                        radius={8}
                        eventHandlers={{
                            click: (event) => {
                                if (routeEditRouteId && onRouteEditMapPick) {
                                    onRouteEditMapPick(routeEditRouteId, selectionPoint);
                                    if (event.originalEvent) {
                                        L.DomEvent.stopPropagation(event.originalEvent);
                                    }
                                }
                            },
                        }}
                        pathOptions={{
                            color: '#ffffff',
                            fillColor: index === 0 ? '#ef4444' : '#f59e0b',
                            fillOpacity: 0.95,
                            weight: 2,
                        }}
                    />
                ))}

                {routeEditDrawPoints.length >= 2 ? (
                    <Polyline
                        positions={routeEditDrawPoints}
                        pathOptions={{
                            color: '#f59e0b',
                            weight: 4,
                            opacity: 0.95,
                            dashArray: '10 8',
                        }}
                    />
                ) : null}

                {displayedPosition && guidanceNearestPoint ? (
                    <Polyline
                        positions={[displayedPosition, guidanceNearestPoint]}
                        pathOptions={{
                            color: '#14b8a6',
                            weight: 3,
                            opacity: 0.85,
                            dashArray: '8 8',
                        }}
                    />
                ) : null}

                {selectedPosition ? (
                    <CircleMarker
                        center={selectedPosition}
                        radius={10}
                        bubblingMouseEvents={false}
                        eventHandlers={{
                            click: (event: LeafletMouseEvent) => {
                                if (event.originalEvent) {
                                    L.DomEvent.stop(event.originalEvent);
                                }
                                onClearSelection();
                            },
                            mousedown: (event: LeafletMouseEvent) => {
                                if (event.originalEvent) {
                                    L.DomEvent.stop(event.originalEvent);
                                }
                            },
                            touchstart: (event: LeafletMouseEvent) => {
                                if (event.originalEvent) {
                                    L.DomEvent.stop(event.originalEvent);
                                }
                            },
                        }}
                        pathOptions={{
                            color: '#134e4a',
                            fillColor: '#14b8a6',
                            fillOpacity: 0.95,
                            weight: 3,
                        }}
                    />
                ) : null}

                {catchPoints.map((catchLog) => (
                    <Marker
                        key={catchLog.id}
                        position={[catchLog.latitude, catchLog.longitude]}
                        icon={createFishPinIcon(Boolean(catchLog.is_owner))}
                        bubblingMouseEvents={false}
                        eventHandlers={{
                            click: (event) => {
                                if (event.originalEvent) {
                                    L.DomEvent.stopPropagation(event.originalEvent);
                                }
                                event.target.openPopup();
                            },
                            mousedown: (event) => {
                                if (event.originalEvent) {
                                    L.DomEvent.stopPropagation(event.originalEvent);
                                }
                            },
                            touchstart: (event) => {
                                if (event.originalEvent) {
                                    L.DomEvent.stopPropagation(event.originalEvent);
                                }
                            },
                        }}
                    >
                        <Popup className="fishmap-popup fishmap-popup--catch">
                            <div className="fishmap-popup-card">
                                <div className="space-y-1">
                                    <p className="fishmap-popup-title">{catchLog.species}</p>
                                    {!catchLog.is_owner && catchLog.owner_name ? (
                                        <p className="fishmap-popup-copy">{t('dashboard.shared_by', { name: catchLog.owner_name })}</p>
                                    ) : null}
                                    <p className="fishmap-popup-copy">
                                        {catchLog.caught_at ? new Date(catchLog.caught_at).toLocaleString() : t('dashboard.date_not_set')}
                                    </p>
                                    {catchLog.bait_used ? <p className="fishmap-popup-copy">{t('dashboard.bait_prefix', { bait: catchLog.bait_used })}</p> : null}
                                    {catchLog.notes ? <p className="fishmap-popup-copy">{catchLog.notes}</p> : null}
                                </div>
                                {catchLog.is_owner ? (
                                    <div className="fishmap-popup-actions">
                                        <button
                                            type="button"
                                            className="fishmap-popup-button fishmap-popup-button--primary"
                                            onClick={() => onEditCatch(catchLog)}
                                        >
                                            {t('dashboard.edit')}
                                        </button>
                                        <button
                                            type="button"
                                            className="fishmap-popup-button fishmap-popup-button--danger"
                                            onClick={() => onDeleteCatch(catchLog)}
                                        >
                                            {t('dashboard.delete')}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {showLoadingOverlay ? (
                <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_30%),linear-gradient(180deg,_#0f172a_0%,_#0b2028_100%)]">
                    <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur">
                        {t('dashboard.loading_map')}
                    </div>
                </div>
            ) : null}

            <div className="absolute bottom-14 left-3 z-[500] md:bottom-5 md:left-5">
                <div className="flex items-center gap-2 md:hidden">
                    <button
                        type="button"
                        onClick={cycleLayer}
                        className="flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/72 px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-white shadow-lg backdrop-blur transition"
                    >
                        <Layers3 className="size-4" />
                        <span className="uppercase">{currentLayerLabel}</span>
                    </button>
                    {canRenderExternalRasterOverlays ? (
                        <button
                            type="button"
                            onClick={() => setShowDepthLayer((value) => !value)}
                            className={`rounded-full px-3 py-2 text-[11px] font-semibold tracking-[0.12em] uppercase shadow-lg backdrop-blur transition ${
                                showDepthLayer ? 'bg-white text-slate-950' : 'border border-white/15 bg-slate-900/72 text-white'
                            }`}
                        >
                            {t('dashboard.map_depth')}
                        </button>
                    ) : null}
                </div>

                <div className="hidden gap-2 md:flex">
                    <button
                        type="button"
                        onClick={() => setBaseLayer('street')}
                        className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase shadow-lg backdrop-blur transition ${
                            baseLayer === 'street'
                                ? 'bg-white text-slate-950'
                                : 'border border-white/15 bg-slate-900/70 text-white/80'
                        }`}
                    >
                        {t('dashboard.map_street')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setBaseLayer('nautical')}
                        className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase shadow-lg backdrop-blur transition ${
                            baseLayer === 'nautical'
                                ? 'bg-white text-slate-950'
                                : 'border border-white/15 bg-slate-900/70 text-white/80'
                        }`}
                    >
                        {t('dashboard.map_nautical')}
                    </button>
                    {satelliteKey && canUseSatellite ? (
                        <button
                            type="button"
                            onClick={() => setBaseLayer('satellite')}
                            className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase shadow-lg backdrop-blur transition ${
                                baseLayer === 'satellite'
                                    ? 'bg-white text-slate-950'
                                    : 'border border-white/15 bg-slate-900/70 text-white/80'
                            }`}
                        >
                            {t('dashboard.map_satellite')}
                        </button>
                    ) : null}
                    {canRenderExternalRasterOverlays ? (
                        <button
                            type="button"
                            onClick={() => setShowDepthLayer((value) => !value)}
                            className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase shadow-lg backdrop-blur transition ${
                                showDepthLayer ? 'bg-white text-slate-950' : 'border border-white/15 bg-slate-900/70 text-white/80'
                            }`}
                        >
                            {t('dashboard.map_depth')}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function createFishPinIcon(isOwner: boolean): Icon {
    const primary = isOwner ? '#10b981' : '#0ea5e9';
    const ring = isOwner ? '#d1fae5' : '#e0f2fe';
    const markup = renderToStaticMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="60" viewBox="0 0 48 60" fill="none">
            <circle cx="24" cy="21" r="18" fill={primary} stroke={ring} strokeWidth="2.5" />
            <g transform="translate(12 9)" color="white">
                <Fish size={24} stroke="currentColor" strokeWidth={2.4} />
            </g>
        </svg>,
    );

    return L.icon({
        iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(markup)}`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -46],
        className: 'fishmap-catch-pin',
    });
}

function calculateDistanceMeters(start: [number, number], end: [number, number]) {
    const earthRadiusMeters = 6371000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRadians(end[0] - start[0]);
    const dLng = toRadians(end[1] - start[1]);
    const lat1 = toRadians(start[0]);
    const lat2 = toRadians(end[0]);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function MapViewport({
    focusRequest,
    refreshKey,
    onTileRefreshRequest,
}: {
    focusRequest: MapFocusRequest | null;
    refreshKey: string;
    onTileRefreshRequest: () => void;
}) {
    const map = useMap();
    const previousKey = useRef<number | null>(null);

    useEffect(() => {
        const timeouts: number[] = [];
        const tileRefreshTimeouts: number[] = [];
        let animationFrame: number | null = null;

        const invalidate = () => {
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }

            animationFrame = window.requestAnimationFrame(() => {
                animationFrame = null;
                map.invalidateSize({ pan: false, debounceMoveend: false });
            });
        };

        const clearQueuedTimeouts = () => {
            timeouts.splice(0).forEach((timeout) => window.clearTimeout(timeout));
            tileRefreshTimeouts.splice(0).forEach((timeout) => window.clearTimeout(timeout));
        };

        const invalidateAcrossSafariViewportSettling = () => {
            clearQueuedTimeouts();
            invalidate();
            [80, 220, 500, 1000].forEach((delay) => {
                timeouts.push(window.setTimeout(invalidate, delay));
            });
            [360, 1100].forEach((delay) => {
                tileRefreshTimeouts.push(window.setTimeout(onTileRefreshRequest, delay));
            });
        };

        const container = map.getContainer();
        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidateAcrossSafariViewportSettling) : null;
        const visualViewport = window.visualViewport;

        resizeObserver?.observe(container);
        map.whenReady(invalidateAcrossSafariViewportSettling);
        invalidateAcrossSafariViewportSettling();

        window.addEventListener('resize', invalidateAcrossSafariViewportSettling);
        window.addEventListener('orientationchange', invalidateAcrossSafariViewportSettling);
        window.addEventListener('pageshow', invalidateAcrossSafariViewportSettling);
        visualViewport?.addEventListener('resize', invalidateAcrossSafariViewportSettling);
        visualViewport?.addEventListener('scroll', invalidateAcrossSafariViewportSettling);

        return () => {
            clearQueuedTimeouts();

            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }

            resizeObserver?.disconnect();
            window.removeEventListener('resize', invalidateAcrossSafariViewportSettling);
            window.removeEventListener('orientationchange', invalidateAcrossSafariViewportSettling);
            window.removeEventListener('pageshow', invalidateAcrossSafariViewportSettling);
            visualViewport?.removeEventListener('resize', invalidateAcrossSafariViewportSettling);
            visualViewport?.removeEventListener('scroll', invalidateAcrossSafariViewportSettling);
        };
    }, [map, onTileRefreshRequest]);

    useEffect(() => {
        const invalidate = () => map.invalidateSize({ pan: false, debounceMoveend: false });
        const timeouts = [0, 80, 220, 500].map((delay) => window.setTimeout(invalidate, delay));
        const tileRefreshTimeout = window.setTimeout(onTileRefreshRequest, 260);

        return () => {
            timeouts.forEach((timeout) => window.clearTimeout(timeout));
            window.clearTimeout(tileRefreshTimeout);
        };
    }, [map, onTileRefreshRequest, refreshKey]);

    useEffect(() => {
        if (!focusRequest || previousKey.current === focusRequest.key) {
            return;
        }

        previousKey.current = focusRequest.key;
        let settleTimer: number | null = null;
        const invalidateAfterAnimation = () => {
            settleTimer = window.setTimeout(() => map.invalidateSize({ pan: false, debounceMoveend: false }), 420);
        };

        if (focusRequest.bounds) {
            map.fitBounds(focusRequest.bounds, {
                animate: true,
                duration: 0.35,
                padding: [36, 36],
            });
            invalidateAfterAnimation();
            return () => {
                if (settleTimer !== null) {
                    window.clearTimeout(settleTimer);
                }
            };
        }

        if (focusRequest.center) {
            map.flyTo(focusRequest.center, Math.max(map.getZoom(), 14), {
                animate: true,
                duration: 0.35,
            });
            invalidateAfterAnimation();
        }

        return () => {
            if (settleTimer !== null) {
                window.clearTimeout(settleTimer);
            }
        };
    }, [focusRequest, map]);

    return null;
}

function MapInteractionBridge({ onInteractionChange }: { onInteractionChange: (isInteracting: boolean) => void }) {
    useMapEvents({
        dragstart() {
            onInteractionChange(true);
        },
        dragend() {
            onInteractionChange(false);
        },
        zoomstart() {
            onInteractionChange(true);
        },
        zoomend() {
            onInteractionChange(false);
        },
    });

    return null;
}

function MapBoundsBridge({ onBoundsChange }: { onBoundsChange: (bounds: MapBounds) => void }) {
    const map = useMap();

    const emitBounds = useCallback(() => {
        const bounds = map.getBounds();
        onBoundsChange({
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
        });
    }, [map, onBoundsChange]);

    useEffect(() => {
        emitBounds();
    }, [emitBounds]);

    useMapEvents({
        moveend: emitBounds,
        zoomend: emitBounds,
    });

    return null;
}

function MapClickHandler({
    allowTapSelection,
    onSelectPosition,
    onLongPress,
}: {
    allowTapSelection: boolean;
    onSelectPosition: (position: [number, number]) => void;
    onLongPress: (position: [number, number]) => void;
}) {
    const map = useMap();
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pressStart = useRef<{ position: [number, number]; pointX: number; pointY: number; moved: boolean; pointerType: 'mouse' | 'touch' | 'pen' } | null>(null);
    const longPressTriggered = useRef(false);

    const beginHold = useCallback((position: [number, number], pointX: number, pointY: number, pointerType: 'mouse' | 'touch' | 'pen') => {
        if (holdTimer.current) {
            clearTimeout(holdTimer.current);
        }

        pressStart.current = {
            position,
            pointX,
            pointY,
            moved: false,
            pointerType,
        };
        longPressTriggered.current = false;

        holdTimer.current = setTimeout(() => {
            if (!pressStart.current || pressStart.current.moved) {
                return;
            }

            longPressTriggered.current = true;
            onLongPress(pressStart.current.position);
        }, 1000);
    }, [onLongPress]);

    const cancelHold = useCallback(() => {
        if (holdTimer.current) {
            clearTimeout(holdTimer.current);
            holdTimer.current = null;
        }

        pressStart.current = null;
    }, []);

    useEffect(() => {
        const container = map.getContainer();

        const isBlockedTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) {
                return false;
            }

            return Boolean(
                target.closest(
                    '.leaflet-marker-icon, .leaflet-popup, .leaflet-control, .leaflet-interactive, .leaflet-marker-pane',
                ),
            );
        };

        const startFromPointer = (clientX: number, clientY: number, target: EventTarget | null, pointerType: 'mouse' | 'touch' | 'pen') => {
            if (isBlockedTarget(target)) {
                cancelHold();
                return;
            }

            const rect = container.getBoundingClientRect();
            const point = L.point(clientX - rect.left, clientY - rect.top);
            const latlng = map.containerPointToLatLng(point);
            beginHold([latlng.lat, latlng.lng], clientX, clientY, pointerType);
        };

        const onPointerDown = (event: PointerEvent) => {
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }

            const pointerType = (event.pointerType || 'mouse') as 'mouse' | 'touch' | 'pen';
            startFromPointer(event.clientX, event.clientY, event.target, pointerType);
        };

        const onMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) {
                return;
            }

            startFromPointer(event.clientX, event.clientY, event.target, 'mouse');
        };

        const onTouchStart = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (!touch) {
                return;
            }

            startFromPointer(touch.clientX, touch.clientY, event.target, 'touch');
        };

        const onPointerMove = (clientX: number, clientY: number) => {
            if (!pressStart.current) {
                return;
            }

            const deltaX = Math.abs(pressStart.current.pointX - clientX);
            const deltaY = Math.abs(pressStart.current.pointY - clientY);
            const threshold = pressStart.current.pointerType === 'touch' ? 18 : 10;

            if (deltaX > threshold || deltaY > threshold) {
                pressStart.current.moved = true;
                cancelHold();
            }
        };

        const onPointerMoveEvent = (event: PointerEvent) => onPointerMove(event.clientX, event.clientY);
        const onMouseMove = (event: MouseEvent) => onPointerMove(event.clientX, event.clientY);
        const onTouchMove = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (!touch) {
                return;
            }
            onPointerMove(touch.clientX, touch.clientY);
        };

        const onEnd = () => cancelHold();
        const onContextMenu = (event: Event) => {
            event.preventDefault();
        };

        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMoveEvent, { passive: true });
        container.addEventListener('pointerup', onEnd, { passive: true });
        container.addEventListener('pointercancel', onEnd, { passive: true });
        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('touchstart', onTouchStart, { passive: true });
        container.addEventListener('mousemove', onMouseMove, { passive: true });
        container.addEventListener('touchmove', onTouchMove, { passive: true });
        container.addEventListener('mouseup', onEnd, { passive: true });
        container.addEventListener('mouseleave', onEnd, { passive: true });
        container.addEventListener('touchend', onEnd, { passive: true });
        container.addEventListener('touchcancel', onEnd, { passive: true });
        container.addEventListener('contextmenu', onContextMenu);

        return () => {
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointermove', onPointerMoveEvent);
            container.removeEventListener('pointerup', onEnd);
            container.removeEventListener('pointercancel', onEnd);
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('mouseup', onEnd);
            container.removeEventListener('mouseleave', onEnd);
            container.removeEventListener('touchend', onEnd);
            container.removeEventListener('touchcancel', onEnd);
            container.removeEventListener('contextmenu', onContextMenu);
        };
    }, [beginHold, cancelHold, map, onLongPress]);

    useMapEvents({
        mouseup() {
            cancelHold();
        },
        touchend() {
            cancelHold();
        },
        mousemove(event) {
            if (!pressStart.current) {
                return;
            }

            const point = map.latLngToContainerPoint(event.latlng);
            const threshold = pressStart.current.pointerType === 'touch' ? 18 : 10;
            if (Math.abs(pressStart.current.pointX - point.x) > threshold || Math.abs(pressStart.current.pointY - point.y) > threshold) {
                pressStart.current.moved = true;
                cancelHold();
            }
        },
        touchmove(event) {
            if (!pressStart.current) {
                return;
            }

            const point = map.latLngToContainerPoint(event.latlng);
            const threshold = pressStart.current.pointerType === 'touch' ? 18 : 10;
            if (Math.abs(pressStart.current.pointX - point.x) > threshold || Math.abs(pressStart.current.pointY - point.y) > threshold) {
                pressStart.current.moved = true;
                cancelHold();
            }
        },
        dragstart() {
            cancelHold();
        },
        zoomstart() {
            cancelHold();
        },
        contextmenu(event) {
            L.DomEvent.preventDefault(event.originalEvent);

            if (!longPressTriggered.current) {
                longPressTriggered.current = true;
                onLongPress([event.latlng.lat, event.latlng.lng]);
            }

            cancelHold();
        },
        click(event) {
            if (longPressTriggered.current) {
                longPressTriggered.current = false;
                cancelHold();
                return;
            }

            cancelHold();

            if (allowTapSelection) {
                onSelectPosition([event.latlng.lat, event.latlng.lng]);
            }
        },
    });

    useEffect(() => cancelHold, [cancelHold]);

    return null;
}

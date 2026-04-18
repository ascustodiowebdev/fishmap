import { useTranslator } from '@/lib/i18n';
import { type CatchLog, type NavigationRoute } from '@/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L, { Icon, LeafletMouseEvent } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
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
    onCurrentPositionChange: (position: [number, number] | null) => void;
    onInteractionChange: (isInteracting: boolean) => void;
    recenterToCurrentSignal: number;
    onInitialLoadChange: (isLoading: boolean) => void;
    onLongPress: (position: [number, number]) => void;
    onEditCatch: (catchLog: CatchLog) => void;
    onDeleteCatch: (catchLog: CatchLog) => void;
    onEditRoute: (route: NavigationRoute) => void;
    onDeleteRoute: (route: NavigationRoute) => void;
}

const defaultCenter: [number, number] = [38.7223, -9.1393];
const satelliteKey = import.meta.env.VITE_MAPTILER_KEY;
type BaseLayerMode = 'street' | 'nautical' | 'satellite';
const layerOrder: BaseLayerMode[] = satelliteKey ? ['street', 'nautical', 'satellite'] : ['street', 'nautical'];

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
    onInteractionChange,
    recenterToCurrentSignal,
    onInitialLoadChange,
    onLongPress,
    onEditCatch,
    onDeleteCatch,
    onEditRoute,
    onDeleteRoute,
}: CatchMapProps) {
    const { t } = useTranslator();
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
    const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
    const [baseLayer, setBaseLayer] = useState<BaseLayerMode>('nautical');
    const [focusRequest, setFocusRequest] = useState<{ center: [number, number]; key: number } | null>(null);
    const hasAutoCenteredRef = useRef(false);
    const loadDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const catchPoints = catchLogs
        .filter((catchLog) => catchLog.latitude && catchLog.longitude)
        .map((catchLog) => ({
            ...catchLog,
            latitude: Number(catchLog.latitude),
            longitude: Number(catchLog.longitude),
        }))
        .filter((catchLog) => Number.isFinite(catchLog.latitude) && Number.isFinite(catchLog.longitude));

    useEffect(() => {
        if (!('geolocation' in navigator)) {
            onCurrentPositionChange(null);
            return;
        }

        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            onCurrentPositionChange(null);
            return;
        }

        const requestPosition = () => {
            navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                    const nextPosition: [number, number] = [coords.latitude, coords.longitude];
                    setCurrentPosition(nextPosition);
                    setLocationAccuracy(Math.round(coords.accuracy));
                    onCurrentPositionChange(nextPosition);

                    if (!hasAutoCenteredRef.current) {
                        hasAutoCenteredRef.current = true;
                        setFocusRequest({
                            center: nextPosition,
                            key: Date.now(),
                        });
                    }
                },
                () => undefined,
                {
                    enableHighAccuracy: true,
                    maximumAge: 5000,
                    timeout: 10000,
                },
            );
        };

        requestPosition();
        const intervalId = window.setInterval(requestPosition, 10000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [onCurrentPositionChange]);

    useEffect(() => {
        return () => {
            if (loadDelayTimer.current) {
                clearTimeout(loadDelayTimer.current);
            }
        };
    }, []);

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

    const displayedPosition = positionOverride ?? currentPosition;

    const routeLines = navigationRoutes
        .map((route) => ({
            ...route,
            latlngs: route.points
                .map((point) => [Number(point.latitude), Number(point.longitude)] as [number, number])
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
        const currentIndex = layerOrder.indexOf(baseLayer);
        const nextLayer = layerOrder[(currentIndex + 1) % layerOrder.length];
        setBaseLayer(nextLayer);
    };

    const currentLayerLabel =
        baseLayer === 'street' ? t('dashboard.map_street') : baseLayer === 'nautical' ? t('dashboard.map_nautical') : t('dashboard.map_satellite');

    return (
        <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#0f172a] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <MapContainer center={initialCenter} zoom={catchPoints.length > 0 ? 8 : 11} scrollWheelZoom zoomControl={false} className="fishmap-map h-full w-full bg-[#0f172a]">
                <MapViewport focusRequest={focusRequest} />
                <MapInteractionBridge onInteractionChange={onInteractionChange} />
                <MapClickHandler allowTapSelection={allowTapSelection} onSelectPosition={onSelectPosition} onLongPress={onLongPress} />

                <TileLayer
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
                    keepBuffer={8}
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

                {baseLayer === 'nautical' ? (
                    <TileLayer
                        attribution='&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> seamarks'
                        url="https://t1.openseamap.org/seamark/{z}/{x}/{y}.png"
                        keepBuffer={8}
                        updateWhenIdle={false}
                        updateWhenZooming
                    />
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
                        </CircleMarker>
                    </>
                ) : null}

                {routeLines.map((route) => (
                    <Polyline
                        key={`route-${route.id}`}
                        positions={route.latlngs}
                        pathOptions={{
                            color: route.is_owner ? '#f59e0b' : '#60a5fa',
                            weight: 4,
                            opacity: 0.8,
                        }}
                    >
                        <Popup>
                            <div className="space-y-1">
                                <p className="font-semibold text-slate-950">{route.name}</p>
                                <p className="text-sm text-slate-600">
                                    {t('dashboard.route_points', { count: route.point_count })}
                                </p>
                                {route.owner_name && !route.is_owner ? (
                                    <p className="text-sm text-slate-600">{t('dashboard.shared_by', { name: route.owner_name })}</p>
                                ) : null}
                                {route.is_owner ? (
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            type="button"
                                            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                                            onClick={() => onEditRoute(route)}
                                        >
                                            {t('dashboard.edit')}
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                                            onClick={() => onDeleteRoute(route)}
                                        >
                                            {t('dashboard.delete')}
                                        </button>
                                    </div>
                                ) : null}
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
                        <Popup>
                            <div className="space-y-1">
                                <p className="font-semibold text-slate-950">{catchLog.species}</p>
                                {!catchLog.is_owner && catchLog.owner_name ? (
                                    <p className="text-sm text-slate-600">{t('dashboard.shared_by', { name: catchLog.owner_name })}</p>
                                ) : null}
                                <p className="text-sm text-slate-600">
                                    {catchLog.caught_at ? new Date(catchLog.caught_at).toLocaleString() : t('dashboard.date_not_set')}
                                </p>
                                {catchLog.bait_used ? <p className="text-sm text-slate-600">{t('dashboard.bait_prefix', { bait: catchLog.bait_used })}</p> : null}
                                {catchLog.notes ? <p className="text-sm text-slate-600">{catchLog.notes}</p> : null}
                                {catchLog.is_owner ? (
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            type="button"
                                            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                                            onClick={() => onEditCatch(catchLog)}
                                        >
                                            {t('dashboard.edit')}
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
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
                <button
                    type="button"
                    onClick={cycleLayer}
                    className="flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/72 px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-white shadow-lg backdrop-blur transition md:hidden"
                >
                    <Layers3 className="size-4" />
                    <span className="uppercase">{currentLayerLabel}</span>
                </button>

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
                    {satelliteKey ? (
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

function MapViewport({ focusRequest }: { focusRequest: { center: [number, number]; key: number } | null }) {
    const map = useMap();
    const previousKey = useRef<number | null>(null);

    useEffect(() => {
        const invalidate = () => map.invalidateSize({ pan: false, debounceMoveend: true });

        invalidate();

        const immediate = window.setTimeout(invalidate, 0);
        const delayed = window.setTimeout(invalidate, 250);

        window.addEventListener('resize', invalidate);

        return () => {
            window.clearTimeout(immediate);
            window.clearTimeout(delayed);
            window.removeEventListener('resize', invalidate);
        };
    }, [map]);

    useEffect(() => {
        if (!focusRequest || previousKey.current === focusRequest.key) {
            return;
        }

        previousKey.current = focusRequest.key;

        map.flyTo(focusRequest.center, Math.max(map.getZoom(), 14), {
            animate: true,
            duration: 0.35,
        });
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

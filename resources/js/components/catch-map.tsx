import { useTranslator } from '@/lib/i18n';
import { type CatchLog } from '@/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import L, { Icon, LeafletMouseEvent } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Fish } from 'lucide-react';

interface CatchMapProps {
    catchLogs: CatchLog[];
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
}

const defaultCenter: [number, number] = [38.7223, -9.1393];
const satelliteKey = import.meta.env.VITE_MAPTILER_KEY;
type BaseLayerMode = 'street' | 'nautical' | 'satellite';

export function CatchMap({
    catchLogs,
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

    const initialCenter = currentPosition ?? (catchPoints.length > 0 ? ([catchPoints[0].latitude, catchPoints[0].longitude] as [number, number]) : defaultCenter);

    const displayAccuracyRadius = useMemo(() => {
        if (!currentPosition || !locationAccuracy || locationAccuracy <= 30) {
            return null;
        }

        return Math.min(Math.max(locationAccuracy / 4, 12), 40);
    }, [currentPosition, locationAccuracy]);

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

                {currentPosition ? (
                    <>
                        {displayAccuracyRadius ? (
                            <CircleMarker
                                center={currentPosition}
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
                            center={currentPosition}
                            radius={10}
                            pathOptions={{
                                color: '#0f172a',
                                fillColor: '#38bdf8',
                                fillOpacity: 0.95,
                                weight: 2,
                            }}
                        >
                            <Popup>
                                {locationAccuracy
                                    ? t('dashboard.you_are_here_accuracy', { accuracy: locationAccuracy })
                                    : t('dashboard.you_are_here')}
                            </Popup>
                        </CircleMarker>
                    </>
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

            <div className="absolute bottom-4 left-4 z-[500] flex gap-2 md:bottom-5 md:left-5">
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
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pressStart = useRef<{ position: [number, number]; startedAt: number; moved: boolean } | null>(null);
    const longPressTriggered = useRef(false);

    const beginHold = (position: [number, number]) => {
        if (holdTimer.current) {
            clearTimeout(holdTimer.current);
        }

        pressStart.current = {
            position,
            startedAt: Date.now(),
            moved: false,
        };
        longPressTriggered.current = false;

        holdTimer.current = setTimeout(() => {
            if (!pressStart.current || pressStart.current.moved) {
                return;
            }

            longPressTriggered.current = true;
            onLongPress(pressStart.current.position);
        }, 1000);
    };

    const cancelHold = () => {
        if (holdTimer.current) {
            clearTimeout(holdTimer.current);
            holdTimer.current = null;
        }

        pressStart.current = null;
    };

    useMapEvents({
        mousedown(event) {
            if (event.originalEvent.button !== 0) {
                return;
            }

            beginHold([event.latlng.lat, event.latlng.lng]);
        },
        touchstart(event) {
            beginHold([event.latlng.lat, event.latlng.lng]);
        },
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

            const [startLat, startLng] = pressStart.current.position;
            if (Math.abs(startLat - event.latlng.lat) > 0.0002 || Math.abs(startLng - event.latlng.lng) > 0.0002) {
                pressStart.current.moved = true;
            }
        },
        touchmove(event) {
            if (!pressStart.current) {
                return;
            }

            const [startLat, startLng] = pressStart.current.position;
            if (Math.abs(startLat - event.latlng.lat) > 0.0002 || Math.abs(startLng - event.latlng.lng) > 0.0002) {
                pressStart.current.moved = true;
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

    useEffect(() => cancelHold, []);

    return null;
}

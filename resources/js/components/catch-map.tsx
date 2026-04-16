import { type CatchLog } from '@/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

interface CatchMapProps {
    catchLogs: CatchLog[];
    selectedPosition: [number, number] | null;
    onSelectPosition: (position: [number, number]) => void;
    onCurrentPositionChange: (position: [number, number] | null) => void;
    onInteractionChange: (isInteracting: boolean) => void;
    recenterToCurrentSignal: number;
    onInitialLoadChange: (isLoading: boolean) => void;
}

const defaultCenter: [number, number] = [38.7223, -9.1393];
const satelliteKey = import.meta.env.VITE_MAPTILER_KEY;

export function CatchMap({
    catchLogs,
    selectedPosition,
    onSelectPosition,
    onCurrentPositionChange,
    onInteractionChange,
    recenterToCurrentSignal,
    onInitialLoadChange,
}: CatchMapProps) {
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
    const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
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
        if (selectedPosition) {
            setFocusRequest({
                center: selectedPosition,
                key: Date.now(),
            });
        }
    }, [selectedPosition]);

    useEffect(() => {
        if (recenterToCurrentSignal > 0 && currentPosition) {
            setFocusRequest({
                center: currentPosition,
                key: recenterToCurrentSignal,
            });
        }
    }, [currentPosition, recenterToCurrentSignal]);

    const initialCenter = currentPosition ?? selectedPosition ?? (catchPoints.length > 0 ? ([catchPoints[0].latitude, catchPoints[0].longitude] as [number, number]) : defaultCenter);

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
                <MapClickHandler onSelectPosition={onSelectPosition} />

                <TileLayer
                    attribution={
                        satelliteKey
                            ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }
                    url={
                        satelliteKey
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
                            <Popup>{locationAccuracy ? `You are here (accuracy about ${locationAccuracy} m).` : 'You are here.'}</Popup>
                        </CircleMarker>
                    </>
                ) : null}

                {selectedPosition ? (
                    <CircleMarker
                        center={selectedPosition}
                        radius={10}
                        pathOptions={{
                            color: '#134e4a',
                            fillColor: '#14b8a6',
                            fillOpacity: 0.95,
                            weight: 3,
                        }}
                    >
                        <Popup>Selected catch spot.</Popup>
                    </CircleMarker>
                ) : null}

                {catchPoints.map((catchLog) => (
                    <CircleMarker
                        key={catchLog.id}
                        center={[catchLog.latitude, catchLog.longitude]}
                        radius={8}
                        pathOptions={{
                            color: '#0f766e',
                            fillColor: '#14b8a6',
                            fillOpacity: 0.75,
                            weight: 2,
                        }}
                    >
                        <Popup>
                            <div className="space-y-1">
                                <p className="font-semibold text-slate-950">{catchLog.species}</p>
                                <p className="text-sm text-slate-600">{catchLog.caught_at ? new Date(catchLog.caught_at).toLocaleString() : 'Date not set'}</p>
                                {catchLog.bait_used ? <p className="text-sm text-slate-600">Bait: {catchLog.bait_used}</p> : null}
                                {catchLog.notes ? <p className="text-sm text-slate-600">{catchLog.notes}</p> : null}
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}
            </MapContainer>

            {showLoadingOverlay ? (
                <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_30%),linear-gradient(180deg,_#0f172a_0%,_#0b2028_100%)]">
                    <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur">
                        Loading map...
                    </div>
                </div>
            ) : null}
        </div>
    );
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

function MapClickHandler({ onSelectPosition }: { onSelectPosition: (position: [number, number]) => void }) {
    useMapEvents({
        click(event) {
            onSelectPosition([event.latlng.lat, event.latlng.lng]);
        },
    });

    return null;
}

import { type CatchLog } from '@/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

interface CatchMapProps {
    catchLogs: CatchLog[];
    selectedPosition: [number, number] | null;
    onSelectPosition: (position: [number, number]) => void;
    onCurrentPositionChange: (position: [number, number]) => void;
    onLocationStatusChange: (status: { message: string; type: 'info' | 'warning' } | null) => void;
}

const defaultCenter: [number, number] = [38.7223, -9.1393];
const satelliteKey = import.meta.env.VITE_MAPTILER_KEY;

export function CatchMap({
    catchLogs,
    selectedPosition,
    onSelectPosition,
    onCurrentPositionChange,
    onLocationStatusChange,
}: CatchMapProps) {
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
    const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
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
            onLocationStatusChange({
                type: 'warning',
                message: 'Geolocation is not available in this browser.',
            });

            return;
        }

        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            onLocationStatusChange({
                type: 'warning',
                message: 'Location access needs a secure page. Use HTTPS for fishmap.test in Herd to enable automatic centering.',
            });

            return;
        }

        onLocationStatusChange({
            type: 'info',
            message: 'Requesting your current position...',
        });

        const updateFromCoordinates = (coords: GeolocationCoordinates) => {
            const nextPosition: [number, number] = [coords.latitude, coords.longitude];
            const nextAccuracy = Math.round(coords.accuracy);

            setCurrentPosition(nextPosition);
            setLocationAccuracy(nextAccuracy);
            onCurrentPositionChange(nextPosition);
            onLocationStatusChange({
                type: nextAccuracy > 150 ? 'warning' : 'info',
                message:
                    nextAccuracy > 150
                        ? `Location found, but Windows accuracy is rough right now (about ${nextAccuracy} m).`
                        : `Centered on your current position (about ${nextAccuracy} m accuracy).`,
            });
        };

        navigator.geolocation.getCurrentPosition(
            ({ coords }) => updateFromCoordinates(coords),
            () => undefined,
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 8000,
            },
        );

        const watchId = navigator.geolocation.watchPosition(
            ({ coords }) => updateFromCoordinates(coords),
            (error) => {
                const message =
                    error.code === error.PERMISSION_DENIED
                        ? 'Location permission was denied. You can still tap the map to place a catch.'
                        : 'Unable to refine your current position right now.';

                onLocationStatusChange({
                    type: 'warning',
                    message,
                });
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 15000,
            },
        );

        return () => {
            navigator.geolocation.clearWatch(watchId);
        };
    }, [onCurrentPositionChange, onLocationStatusChange]);

    useEffect(() => {
        return () => {
            if (loadDelayTimer.current) {
                clearTimeout(loadDelayTimer.current);
            }
        };
    }, []);

    const initialCenter = currentPosition ?? selectedPosition ?? (catchPoints.length > 0 ? ([catchPoints[0].latitude, catchPoints[0].longitude] as [number, number]) : defaultCenter);
    const displayCenter = currentPosition ?? selectedPosition ?? initialCenter;

    const displayAccuracyRadius = useMemo(() => {
        if (!currentPosition || !locationAccuracy || locationAccuracy <= 30) {
            return null;
        }

        return Math.min(Math.max(locationAccuracy / 4, 12), 40);
    }, [currentPosition, locationAccuracy]);

    return (
        <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#07131a] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <MapContainer center={initialCenter} zoom={catchPoints.length > 0 ? 8 : 11} scrollWheelZoom zoomControl={false} className="h-full w-full bg-[#07131a]">
                <MapViewport center={displayCenter} />
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
                    eventHandlers={{
                        loading: () => {
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
                <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_30%),linear-gradient(180deg,_#07131a_0%,_#0b2028_100%)]">
                    <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur">
                        Loading map...
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function MapViewport({ center }: { center: [number, number] }) {
    const map = useMap();
    const previousCenter = useRef<[number, number] | null>(null);

    useEffect(() => {
        const last = previousCenter.current;

        if (last && Math.abs(last[0] - center[0]) < 0.00001 && Math.abs(last[1] - center[1]) < 0.00001) {
            return;
        }

        previousCenter.current = center;

        map.flyTo(center, Math.max(map.getZoom(), 14), {
            animate: true,
            duration: 0.35,
        });
    }, [center, map]);

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

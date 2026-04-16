import { type CatchLog } from '@/types';
import { LayersControl, MapContainer, CircleMarker, Popup, TileLayer } from 'react-leaflet';

interface CatchMapProps {
    catchLogs: CatchLog[];
}

const defaultCenter: [number, number] = [38.7223, -9.1393];
const satelliteKey = import.meta.env.VITE_MAPTILER_KEY;

export function CatchMap({ catchLogs }: CatchMapProps) {
    const catchPoints = catchLogs
        .filter((catchLog) => catchLog.latitude && catchLog.longitude)
        .map((catchLog) => ({
            ...catchLog,
            latitude: Number(catchLog.latitude),
            longitude: Number(catchLog.longitude),
        }))
        .filter((catchLog) => Number.isFinite(catchLog.latitude) && Number.isFinite(catchLog.longitude));

    const center = catchPoints.length > 0 ? ([catchPoints[0].latitude, catchPoints[0].longitude] as [number, number]) : defaultCenter;

    return (
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200">
            <MapContainer center={center} zoom={catchPoints.length > 0 ? 8 : 6} scrollWheelZoom className="h-[360px] w-full">
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="OpenStreetMap">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>

                    {satelliteKey ? (
                        <LayersControl.BaseLayer name="Satellite">
                            <TileLayer
                                attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url={`https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${satelliteKey}`}
                            />
                        </LayersControl.BaseLayer>
                    ) : null}
                </LayersControl>

                {catchPoints.map((catchLog) => (
                    <CircleMarker
                        key={catchLog.id}
                        center={[catchLog.latitude, catchLog.longitude]}
                        radius={8}
                        pathOptions={{
                            color: '#0f766e',
                            fillColor: '#14b8a6',
                            fillOpacity: 0.85,
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
        </div>
    );
}

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Port Coordinates (Expanded)
const PORTS = {
    'Shanghai': [31.2304, 121.4737],
    'Singapore': [1.3521, 103.8198],
    'Rotterdam': [51.9225, 4.47917],
    'Los Angeles': [33.7423, -118.2614],
    'New York': [40.7128, -74.0060],
    'Hamburg': [53.5511, 9.9937],
    'Tokyo': [35.6762, 139.6503],
    'Dubai': [25.2048, 55.2708],
    'Busan': [35.1796, 129.0756],
    'Hong Kong': [22.3193, 114.1694],
    'Qingdao': [36.0671, 120.3826],
    'Shenzhen': [22.5431, 114.0579],
    'Ningbo': [29.8683, 121.5440],
    'Tianjin': [39.0842, 117.2009],
    'Guangzhou': [23.1291, 113.2644],
    'Port Klang': [3.00, 101.40],
    'Antwerp': [51.2194, 4.4025],
    'Kaohsiung': [22.6273, 120.3014],
    'Xiamen': [24.4798, 118.0894],
    'Dalian': [38.9140, 121.6147],
    // Fallbacks
    'Origin': [31.2304, 121.4737],
    'Dest': [51.9225, 4.47917]
};

function MapController({ bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [bounds, map]);
    return null;
}

// Simple Quadratic Bezier Curve Generator
const getCurvePoints = (start, end, numPoints = 60) => {
    const points = [];
    const midLat = (start[0] + end[0]) / 2;
    const midLng = (start[1] + end[1]) / 2;
    const controlLat = midLat + (Math.abs(start[1] - end[1]) > 50 ? 20 : 5);
    const controlLng = midLng;

    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const lat = Math.pow(1 - t, 2) * start[0] +
            2 * (1 - t) * t * controlLat +
            Math.pow(t, 2) * end[0];
        const lng = Math.pow(1 - t, 2) * start[1] +
            2 * (1 - t) * t * controlLng +
            Math.pow(t, 2) * end[1];
        points.push([lat, lng]);
    }
    return points;
};

export default function FleetMap({ shipments, selectedId, onSelect }) {
    const [routes, setRoutes] = useState([]);
    const [bounds, setBounds] = useState(null);

    useEffect(() => {
        if (!shipments || shipments.length === 0) {
            setRoutes([]);
            return;
        }

        const newRoutes = shipments.map(s => {
            const originName = s.logistics?.portOfLoading || 'Origin';
            const destName = s.logistics?.portOfDischarge || 'Dest';

            const start = PORTS[originName] || PORTS['Origin'];
            const end = PORTS[destName] || PORTS['Dest'];

            // Calculate current position based on simulated progress
            const progress = s.progress || Math.random() * 0.8 + 0.1;
            const path = getCurvePoints(start, end);
            const currentIdx = Math.floor(path.length * progress);
            const currentPos = path[currentIdx];

            // Styling Logic
            const isInvested = s.isInvested;

            // Default (Non-Invested): Dimmed, Gray
            let color = '#374151';
            let opacity = 0.3;
            let weight = 2;

            // Highlight (Invested): Vibrant Risk Colors
            if (isInvested) {
                opacity = 1;
                weight = 4;
                if (s.riskScore >= 80) color = '#10b981';
                else if (s.riskScore >= 60) color = '#f59e0b';
                else color = '#ef4444';
            }

            // Selection override
            if (s.bolHash === selectedId) {
                color = '#3b82f6';
                opacity = 1;
                weight = 5;
            }

            return {
                id: s.bolHash,
                blNumber: s.blNumber,
                isInvested,
                path,
                currentPos,
                start,
                end,
                color,
                opacity,
                weight,
                highlight: s.bolHash === selectedId || isInvested
            };
        });

        // SORT: Render Non-Invested first (bottom), Invested last (top)
        newRoutes.sort((a, b) => {
            if (a.highlight === b.highlight) return 0;
            return a.highlight ? 1 : -1;
        });

        setRoutes(newRoutes);

        // Calculate bounds to fit all
        if (newRoutes.length > 0) {
            const latLngs = newRoutes.flatMap(r => [r.start, r.end]);
            setBounds(L.latLngBounds(latLngs));
        }
    }, [shipments, selectedId]);

    // Show loading state if no routes
    if (routes.length === 0) {
        return <div style={{ height: '100%', width: '100%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Loading Fleet Map...</div>;
    }

    return (
        <MapContainer
            center={[20, 0]}
            zoom={2}
            style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            <MapController bounds={bounds} />

            {routes.map(route => (
                <div key={route.id}>
                    {/* Route Line */}
                    <Polyline
                        positions={route.path}
                        color={route.color}
                        weight={route.weight}
                        opacity={route.opacity}
                        eventHandlers={{
                            click: () => onSelect && onSelect(route.id)
                        }}
                    >
                        <Popup>
                            <div>
                                <strong>{route.blNumber}</strong><br />
                                Risk Score: {shipments.find(s => s.bolHash === route.id)?.riskScore}
                            </div>
                        </Popup>
                    </Polyline>

                    {/* Current Vessel Position */}
                    <CircleMarker
                        center={route.currentPos}
                        radius={route.highlight ? 6 : 3}
                        pathOptions={{
                            color: '#fff',
                            fillColor: route.color,
                            fillOpacity: 1,
                            weight: 1
                        }}
                    />
                </div>
            ))}
        </MapContainer>
    );
}

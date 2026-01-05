
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with Next.js
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
    iconUrl,
    iconRetinaUrl,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Ship Icon
const shipIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/870/870092.png', // Simple ship icon
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -10],
});

// Port Coordinates Database (Simplified)
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
    // Fallbacks
    'Origin': [31.2304, 121.4737], // Default to Shanghai
    'Dest': [51.9225, 4.47917]     // Default to Rotterdam
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

export default function VesselMap({ origin, destination, progress = 0 }) {
    const [startPos, setStartPos] = useState(null);
    const [endPos, setEndPos] = useState(null);
    const [currentPos, setCurrentPos] = useState(null);
    const [pathPoints, setPathPoints] = useState([]);
    const [bounds, setBounds] = useState(null);

    // Simple Quadratic Bezier Curve Generator
    const getCurvePoints = (start, end, numPoints = 60) => {
        const points = [];
        // Midpoint
        const midLat = (start[0] + end[0]) / 2;
        const midLng = (start[1] + end[1]) / 2;

        // Control Point (Offset to create arc)
        const controlLat = midLat + (Math.abs(start[1] - end[1]) > 50 ? 20 : 5);
        const controlLng = midLng;

        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            // Quadratic Bezier calculation
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

    useEffect(() => {
        const start = PORTS[origin] || PORTS['Origin'];
        const end = PORTS[destination] || PORTS['Dest'];

        setStartPos(start);
        setEndPos(end);

        // Generate Curve
        const curve = getCurvePoints(start, end);
        setPathPoints(curve);

        // Calculate current position along the curve
        const idx = Math.min(Math.floor(progress * (curve.length - 1)), curve.length - 1);
        setCurrentPos(curve[idx]);

        setBounds(L.latLngBounds(curve));

    }, [origin, destination, progress]);

    if (!startPos || !endPos || !currentPos || pathPoints.length === 0) return <div className="map-loading">Initializing Map...</div>;

    return (
        <MapContainer
            center={currentPos}
            zoom={3}
            style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            <MapController bounds={bounds} />

            {/* Curved Route Line */}
            <Polyline
                positions={pathPoints}
                color="#10b981"
                dashArray="5, 10"
                weight={2}
                opacity={0.6}
            />

            {/* Origin Marker */}
            <Marker position={startPos} icon={defaultIcon}>
                <Popup>{origin}</Popup>
            </Marker>

            {/* Destination Marker */}
            <Marker position={endPos} icon={defaultIcon}>
                <Popup>{destination}</Popup>
            </Marker>

            {/* Vessel Marker */}
            <Marker position={currentPos} icon={shipIcon} zIndexOffset={1000}>
                <Popup>
                    <div className="vessel-popup">
                        <strong>Live Position</strong><br />
                        {(progress * 100).toFixed(1)}% Completed
                    </div>
                </Popup>
            </Marker>
        </MapContainer>
    );
}

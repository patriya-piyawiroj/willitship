import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { CONFIG } from '../../lib/config';
import dynamic from 'next/dynamic';
import { fetchRiskScore } from '../../utils/riskApi';
import { calculateRiskScore } from '../../utils/riskLogic';

// Dynamic import for FleetMap (client-side only)
const FleetMap = dynamic(() => import('../../components/FleetMap'), {
    ssr: false,
    loading: () => <div style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#666' }}>Loading Global Fleet Map...</div>
});

export default function InvestorMapDashboard() {
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRisk, setFilterRisk] = useState('all');
    const [onlyMyInvestments, setOnlyMyInvestments] = useState(false);
    const [selectedShipmentId, setSelectedShipmentId] = useState(null);

    useEffect(() => {
        fetchShipments();
    }, []);

    const fetchShipments = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${CONFIG.API_URL}/shipments`);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();

            // Use stored risk scores from API response, fallback to local calculation if not available
            const processed = data.map(s => {
                // If API returns stored risk scores, use them
                if (s.riskScore !== null && s.riskScore !== undefined) {
                    return {
                        ...s,
                        riskScore: s.riskScore,
                        riskRating: s.riskRating || 'BBB',
                        riskBand: s.riskBand || 'MEDIUM',
                        isInvested: Math.random() > 0.7
                    };
                }

                // Fallback to local calculation for older shipments without stored scores
                const risk = calculateRiskScore(s);
                return {
                    ...s,
                    riskScore: risk.score,
                    riskRating: risk.rating,
                    riskBand: risk.band,
                    isInvested: Math.random() > 0.7
                };
            });
            setShipments(processed);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const filteredShipments = shipments.filter(s => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm ||
            (s.blNumber || '').toLowerCase().includes(searchLower) ||
            (s.shipper || '').toLowerCase().includes(searchLower) ||
            (s.logistics?.vessel || '').toLowerCase().includes(searchLower);

        let matchesRisk = true;
        if (filterRisk === 'low') matchesRisk = s.riskScore >= 80;
        if (filterRisk === 'medium') matchesRisk = s.riskScore >= 60 && s.riskScore < 80;
        if (filterRisk === 'high') matchesRisk = s.riskScore < 60;

        const matchesInvestment = !onlyMyInvestments || s.isInvested;

        return matchesSearch && matchesRisk && matchesInvestment;
    });

    return (
        <Layout>
            <div className="map-dashboard">
                {/* Filters Panel */}
                <div className="map-filters">
                    <h2>Global Fleet Map</h2>

                    <div className="filter-section">
                        <input
                            type="text"
                            placeholder="Search Vessel, BL, Shipper..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="filter-section">
                        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
                            <option value="all">All Risks</option>
                            <option value="low">Low Risk (80+)</option>
                            <option value="medium">Medium (60-79)</option>
                            <option value="high">High Risk (&lt;60)</option>
                        </select>
                    </div>

                    <div className="filter-section">
                        <label>
                            <input
                                type="checkbox"
                                checked={onlyMyInvestments}
                                onChange={e => setOnlyMyInvestments(e.target.checked)}
                            />
                            Show My Investments Only
                        </label>
                    </div>

                    <div className="shipment-list">
                        {loading && <div className="loading-text">Loading...</div>}
                        {!loading && filteredShipments.length === 0 && <div className="loading-text">No shipments found.</div>}

                        {filteredShipments.slice(0, 20).map(s => (
                            <div
                                key={s.bolHash}
                                onClick={() => setSelectedShipmentId(s.bolHash)}
                                className={`shipment-item ${selectedShipmentId === s.bolHash ? 'selected' : ''}`}
                            >
                                <div className="shipment-header">
                                    <span className="bl-number">{s.blNumber}</span>
                                    <span className={`risk-badge ${s.riskScore >= 80 ? 'low' : s.riskScore >= 60 ? 'medium' : 'high'}`}>
                                        {s.riskScore}
                                    </span>
                                </div>
                                <div className="shipment-shipper">{s.shipper || 'Unknown'}</div>
                                <div className="shipment-route">
                                    {s.logistics?.portOfLoading} → {s.logistics?.portOfDischarge}
                                </div>
                                {s.isInvested && <div className="invested-badge">✓ Invested</div>}
                            </div>
                        ))}
                        {filteredShipments.length > 20 && (
                            <div className="loading-text">...and {filteredShipments.length - 20} more</div>
                        )}
                    </div>
                </div>

                {/* Map Container */}
                <div className="map-container">
                    <FleetMap
                        shipments={filteredShipments}
                        selectedId={selectedShipmentId}
                        onSelect={setSelectedShipmentId}
                    />

                    {/* Legend */}
                    <div className="map-legend">
                        <div className="legend-title">Risk Levels</div>
                        <div className="legend-item"><span className="dot green"></span> Low (80+)</div>
                        <div className="legend-item"><span className="dot yellow"></span> Medium (60-79)</div>
                        <div className="legend-item"><span className="dot red"></span> High (&lt;60)</div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .map-dashboard {
                    display: flex;
                    gap: 1rem;
                    height: calc(100vh - 200px);
                    min-height: 600px;
                }
                
                .map-filters {
                    width: 320px;
                    min-width: 320px;
                    background: var(--color-bg-secondary);
                    border-radius: 12px;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                
                .map-filters h2 {
                    margin: 0 0 1rem 0;
                    color: var(--color-text-primary);
                }
                
                .filter-section {
                    margin-bottom: 1rem;
                }
                
                .filter-section input[type="text"],
                .filter-section select {
                    width: 100%;
                    padding: 0.5rem;
                    background: var(--color-bg-tertiary);
                    border: 1px solid var(--color-border);
                    border-radius: 6px;
                    color: var(--color-text-primary);
                }
                
                .filter-section label {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                }
                
                .shipment-list {
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .shipment-item {
                    padding: 0.75rem;
                    background: var(--color-bg-tertiary);
                    border: 1px solid var(--color-border);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .shipment-item:hover {
                    border-color: var(--color-accent);
                }
                
                .shipment-item.selected {
                    border-color: var(--color-accent);
                    background: rgba(59, 130, 246, 0.1);
                }
                
                .shipment-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.25rem;
                }
                
                .bl-number {
                    font-family: monospace;
                    color: var(--color-accent);
                    font-weight: bold;
                }
                
                .risk-badge {
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: bold;
                }
                
                .risk-badge.low { background: rgba(16, 185, 129, 0.2); color: #10b981; }
                .risk-badge.medium { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
                .risk-badge.high { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
                
                .shipment-shipper {
                    color: var(--color-text-primary);
                    font-size: 0.875rem;
                }
                
                .shipment-route {
                    color: var(--color-text-tertiary);
                    font-size: 0.75rem;
                }
                
                .invested-badge {
                    color: #10b981;
                    font-size: 0.75rem;
                    margin-top: 0.25rem;
                }
                
                .loading-text {
                    color: var(--color-text-tertiary);
                    text-align: center;
                    padding: 1rem;
                }
                
                .map-container {
                    flex: 1;
                    position: relative;
                    border-radius: 12px;
                    overflow: hidden;
                    background: #1a1a1a;
                    min-height: 600px;
                }
                
                .map-legend {
                    position: absolute;
                    bottom: 1rem;
                    right: 1rem;
                    background: rgba(0, 0, 0, 0.8);
                    padding: 0.75rem;
                    border-radius: 8px;
                    border: 1px solid var(--color-border);
                    z-index: 1000;
                }
                
                .legend-title {
                    font-weight: bold;
                    color: var(--color-text-primary);
                    margin-bottom: 0.5rem;
                    font-size: 0.75rem;
                }
                
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--color-text-secondary);
                    font-size: 0.75rem;
                }
                
                .dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                }
                
                .dot.green { background: #10b981; }
                .dot.yellow { background: #f59e0b; }
                .dot.red { background: #ef4444; }
            `}</style>
        </Layout>
    );
}

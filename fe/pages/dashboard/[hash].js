import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import Layout from '../../components/Layout';
import { CONFIG } from '../../lib/config';
import dynamic from 'next/dynamic';

// Dynamic import for Map (client-side only)
const VesselMap = dynamic(() => import('../../components/VesselMap'), {
    ssr: false,
    loading: () => <div className="p-4 text-center text-gray-400">Loading Map...</div>
});

export default function ShipmentDetail() {
    const router = useRouter();
    const { hash } = router.query;
    // ... existing hooks ...
    const { currentAccount } = useApp();
    const [shipment, setShipment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('summary');

    // Calculate progress for map
    const getVoyageProgress = () => {
        if (!shipment?.logistics?.shippedOnBoardDate) return 0;

        const start = new Date(shipment.logistics.shippedOnBoardDate).getTime();
        const now = new Date().getTime();
        // Assume 30 days voyage if no arrival date
        const duration = 30 * 24 * 60 * 60 * 1000;

        // Return 0-1 (cap at 1)
        return Math.min(Math.max((now - start) / duration, 0), 0.95);
    };

    useEffect(() => {
        // ... (rest is same)
        if (hash) {
            fetchShipmentDetails(hash);
        }
    }, [hash]);

    const fetchShipmentDetails = async (bolHash) => {
        try {
            setLoading(true);
            const response = await fetch(`${CONFIG.API_URL}/shipments/${bolHash}`);
            if (!response.ok) throw new Error('Failed to fetch shipment details');
            const data = await response.json();

            // Mock missing data for demo if needed
            if (!data.riskScore) {
                data.riskScore = 88;
                data.riskBand = 'Low Risk';
            }

            setShipment(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { id: 'summary', label: 'Summary' },
        { id: 'financials', label: 'Financials' },
        { id: 'logistics', label: 'Logistics' },
        { id: 'participants', label: 'Participants' },
    ];

    if (loading) return <Layout><div className="p-8 text-center">Loading Data...</div></Layout>;
    if (!shipment) return <Layout><div className="p-8 text-center">Shipment not found</div></Layout>;

    return (
        <Layout>
            <div className="detail-container">
                {/* Header Section */}
                <div className="detail-header">
                    <div className="header-top">
                        <h1 className="ticker-symbol">{shipment.blNumber}</h1>
                        <span className={`risk-badge ${shipment.riskScore >= 90 ? 'safe' : 'cau'}`}>
                            {shipment.riskBand || 'Prime Investment'}
                        </span>
                    </div>
                    <h2 className="company-name">{shipment.shipper || 'Unknown Shipper'}</h2>

                    <div className="price-section">
                        <div className="current-price">
                            ${parseInt(shipment.declaredValue).toLocaleString()}
                        </div>
                        <div className="price-change positive">
                            +{shipment.riskScore}% <span className="text-sm">(Risk Score)</span>
                        </div>
                    </div>
                </div>

                <div className="chart-placeholder" style={{ display: 'none' }}>
                    {/* Chart Removed */}
                </div>

                {/* Tabs */}
                <div className="tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="tab-content main-panel">
                    <div className="panel-content">
                        {activeTab === 'summary' && (
                            <div className="grid-2">
                                <div className="info-group">
                                    <h3>Investment Highlights</h3>
                                    <ul className="highlights-list">
                                        <li>High-grade cargo passing through low-risk ports</li>
                                        <li>Shipper has 5+ years of verified history</li>
                                        <li>Fully insured with A-rated carrier</li>
                                    </ul>
                                </div>
                                <div className="info-group">
                                    <h3>Key Stats</h3>
                                    <div className="stat-row">
                                        <span>Volume</span>
                                        <strong>{parseInt(shipment.totalFunded || 0) / parseInt(shipment.declaredValue) * 100}% Funded</strong>
                                    </div>
                                    <div className="stat-row">
                                        <span>Market Cap</span>
                                        <strong>${parseInt(shipment.declaredValue).toLocaleString()}</strong>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'logistics' && (
                            <div className="logistics-view">
                                <div className="route-map-container" style={{ height: '400px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border-default)' }}>
                                    <VesselMap
                                        origin={shipment.logistics?.portOfLoading}
                                        destination={shipment.logistics?.portOfDischarge}
                                        progress={getVoyageProgress()}
                                    />
                                </div>
                                <div className="grid-2 mt-4">
                                    <div className="field">
                                        <label>Vessel</label>
                                        <div>{shipment.logistics?.vessel}</div>
                                    </div>
                                    <div className="field">
                                        <label>Voyage No</label>
                                        <div>{shipment.logistics?.voyageNo}</div>
                                    </div>
                                    <div className="field">
                                        <label>Port of Loading</label>
                                        <div>{shipment.logistics?.portOfLoading}</div>
                                    </div>
                                    <div className="field">
                                        <label>Port of Discharge</label>
                                        <div>{shipment.logistics?.portOfDischarge}</div>
                                    </div>
                                    <div className="field">
                                        <label>Shipped Date</label>
                                        <div>{shipment.logistics?.shippedOnBoardDate}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'financials' && (
                            <div className="financials-view">
                                <div className="grid-2">
                                    <div className="field">
                                        <label>Declared Value</label>
                                        <div>${parseInt(shipment.declaredValue).toLocaleString()}</div>
                                    </div>
                                    <div className="field">
                                        <label>Total Funded</label>
                                        <div>${parseInt(shipment.totalFunded || 0).toLocaleString()}</div>
                                    </div>
                                    <div className="field">
                                        <label>Payment Terms</label>
                                        <div>Net 30</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'participants' && (
                            <div className="participants-view">
                                <div className="grid-2">
                                    <div className="field">
                                        <label>Shipper</label>
                                        <div className="p-card">{shipment.shipper}</div>
                                    </div>
                                    <div className="field">
                                        <label>Consignee</label>
                                        <div className="p-card">{shipment.consignee}</div>
                                    </div>
                                    <div className="field">
                                        <label>Carrier</label>
                                        <div className="p-card">Maersk Line</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
        .detail-container {
            padding: 2rem;
            max-width: 1200px;
            margin: 0 auto;
        }
        .detail-header {
            margin-bottom: 2rem;
        }
        .header-top {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .ticker-symbol {
            font-size: 2.5rem;
            font-weight: 800;
            margin: 0;
            letter-spacing: 1px;
        }
        .company-name {
            font-size: 1.2rem;
            color: var(--color-text-secondary);
            font-weight: 400;
            margin: 0.5rem 0;
        }
        .price-section {
            display: flex;
            align-items: baseline;
            gap: 1rem;
            margin-top: 0.5rem;
        }
        .current-price {
            font-size: 2rem;
            font-weight: 700;
        }
        .price-change {
            font-size: 1.2rem;
            font-weight: 600;
        }
        .price-change.positive { color: #10b981; }
        .risk-badge {
            background: #10b981;
            color: #000;
            padding: 0.2rem 0.6rem;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        
        .chart-placeholder {
            height: 300px;
            background: var(--color-background-secondary);
            border: 1px solid var(--color-border-default);
            margin-bottom: 2rem;
            border-radius: 8px;
            position: relative;
            padding: 1rem;
        }
        .chart-msg {
            position: absolute;
            top: 1rem;
            left: 1rem;
            color: var(--color-text-tertiary);
        }

        .tabs {
            display: flex;
            border-bottom: 1px solid var(--color-border-default);
            margin-bottom: 1.5rem;
        }
        .tab-btn {
            padding: 1rem 1.5rem;
            background: transparent;
            border: none;
            color: var(--color-text-secondary);
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            border-bottom: 3px solid transparent;
        }
        .tab-btn.active {
            color: var(--color-text-primary);
            border-bottom-color: #3b82f6;
        }
        
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
        }
        .highlights-list li {
            margin-bottom: 0.5rem;
            padding-left: 1rem;
            border-left: 2px solid #10b981;
        }
        .info-group h3 {
            margin-bottom: 1rem;
            font-size: 1.1rem;
             color: var(--color-text-secondary);
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            padding: 0.8rem 0;
            border-bottom: 1px solid var(--color-border-default);
        }
        
        .field label {
            display: block;
            color: var(--color-text-tertiary);
            font-size: 0.85rem;
            margin-bottom: 0.2rem;
        }
        .field div {
            font-size: 1.1rem;
        }
        .route-map-placeholder {
            height: 200px;
            background: #111;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #666;
            font-family: monospace;
        }
        .p-card {
            background: var(--color-background-tertiary);
            padding: 1rem;
            border-radius: 6px;
        }
        .mt-4 { margin-top: 1rem; }
      `}</style>
        </Layout>
    );
}

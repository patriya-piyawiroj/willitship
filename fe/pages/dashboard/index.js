import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import Layout from '../../components/Layout';
import { CONFIG } from '../../lib/config';
import { calculateRiskScore, getRiskColor } from '../../utils/riskLogic';

export default function DashboardIndex() {
    const router = useRouter();
    const { currentAccount, wallets, walletsLoading, setSelectedShipmentHash } = useApp();
    const [shipments, setShipments] = useState([]);
    const [filteredShipments, setFilteredShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [riskFilter, setRiskFilter] = useState('all');

    // New Filters & Sort
    const [sortBy, setSortBy] = useState('newest');
    const [valueFilter, setValueFilter] = useState('all');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    // Define table columns
    const columns = [
        { label: 'BL Ticker', key: 'blNumber', className: 'col-ticker' },
        { label: 'Company', key: 'shipper', className: 'col-company' },
        { label: 'Vessel', key: 'vessel', className: 'col-vessel' },
        { label: 'Route', key: 'route', className: 'col-route' },
        { label: 'Value', key: 'declaredValue', className: 'col-price' },
        { label: 'Rating', key: 'riskRating', className: 'col-rating' },
        { label: 'Score', key: 'riskScore', className: 'col-score' },
        { label: 'Volume', key: 'funded', className: 'col-volume' },
    ];

    useEffect(() => {
        fetchShipments();
    }, [currentAccount, wallets, walletsLoading]);

    useEffect(() => {
        const results = filterAndSortShipments();
        setFilteredShipments(results);
        setCurrentPage(1);
    }, [searchTerm, riskFilter, valueFilter, sortBy, shipments]);



    const filterAndSortShipments = () => {
        let result = [...shipments];

        // Search
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(item =>
                (item.blNumber || '').toLowerCase().includes(lowerTerm) ||
                (item.shipper || '').toLowerCase().includes(lowerTerm) ||
                (item.vessel || '').toLowerCase().includes(lowerTerm)
            );
        }

        // Risk Filter
        if (riskFilter !== 'all') {
            if (riskFilter === 'high') result = result.filter(item => item.riskValue < 60);
            if (riskFilter === 'medium') result = result.filter(item => item.riskValue >= 60 && item.riskValue < 80);
            if (riskFilter === 'low') result = result.filter(item => item.riskValue >= 80);
        }

        // Value Filter
        if (valueFilter !== 'all') {
            if (valueFilter === 'under_100k') result = result.filter(item => parseInt(item.declaredValue) < 100000);
            if (valueFilter === '100k_500k') result = result.filter(item => parseInt(item.declaredValue) >= 100000 && parseInt(item.declaredValue) <= 500000);
            if (valueFilter === 'over_500k') result = result.filter(item => parseInt(item.declaredValue) > 500000);
        }

        // Sorting
        result.sort((a, b) => {
            switch (sortBy) {
                case 'value_desc': return parseInt(b.declaredValue) - parseInt(a.declaredValue);
                case 'value_asc': return parseInt(a.declaredValue) - parseInt(b.declaredValue);
                case 'risk_desc': return b.riskValue - a.riskValue; // Higher score first (Low Risk)
                case 'risk_asc': return a.riskValue - b.riskValue; // Lower score first (High Risk)
                case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                case 'newest':
                default:
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
        });

        return result;
    };

    const fetchShipments = async () => {
        try {
            setLoading(true);
            let url = `${CONFIG.API_URL}/shipments`;

            // For dashboard, we might want to see ALL shipments available for investment
            // unrelated to the current user's specific role-based filtering, 
            // OR we can keep the filtering. For "Market Overview", showing all is better.
            // But let's respect the current pattern:

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch shipments');
            }
            const data = await response.json();

            // Enrich data for the table
            const processedData = (data || []).map(s => {
                const risk = calculateRiskScore(s);

                return {
                    ...s,
                    shipper: s.shipper || 'Unknown Shipper',
                    vessel: s.logistics?.vessel || 'Unknown Vessel', // Fallback
                    route: `${s.logistics?.portOfLoading || 'Origin'} -> ${s.logistics?.portOfDischarge || 'Dest'}`,
                    riskValue: risk.score,
                    riskScore: risk.score.toString(), // Just the number
                    riskRating: risk.rating,
                    funded: s.totalFunded ? Math.round((parseInt(s.totalFunded) / parseInt(s.declaredValue)) * 100) + '%' : '0%'
                };
            });

            // Initial sort
            processedData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setShipments(processedData);
            setFilteredShipments(processedData);
        } catch (error) {
            console.error('Error fetching shipments:', error);
            setShipments([]);
            setFilteredShipments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleRowClick = (shipment) => {
        setSelectedShipmentHash(shipment.bolHash);
        router.push(`/dashboard/${shipment.bolHash}`);
    };

    const formatCurrency = (val) => {
        if (!val) return '$0';
        return '$' + parseInt(val).toLocaleString();
    };



    // Calculate pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredShipments.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredShipments.length / itemsPerPage);

    return (
        <Layout>
            <div className="dashboard-container">
                <header className="page-header">
                    <h1 className="page-title">Market Overview</h1>
                    <div className="market-stats">
                        <div className="stat-item">
                            <span className="stat-label">Total Volume</span>
                            <span className="stat-value">{filteredShipments.length}</span>
                        </div>
                    </div>
                </header>

                <div className="main-panel">
                    <div className="panel-content" style={{ padding: 0 }}>
                        {/* Filters Toolbar */}
                        <div className="filters-toolbar">
                            <div className="search-box">
                                <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search Ticker, Company, Vessel..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="filter-group">
                                <label>Risk:</label>
                                <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                                    <option value="all">All Levels</option>
                                    <option value="low">Low Risk (80+)</option>
                                    <option value="medium">Medium Risk (60-79)</option>
                                    <option value="high">High Risk (&lt;60)</option>
                                </select>
                            </div>

                            <div className="filter-group">
                                <label>Value:</label>
                                <select value={valueFilter} onChange={(e) => setValueFilter(e.target.value)}>
                                    <option value="all">Any Value</option>
                                    <option value="under_100k">&lt; $100k</option>
                                    <option value="100k_500k">$100k - $500k</option>
                                    <option value="over_500k">&gt; $500k</option>
                                </select>
                            </div>

                            <div className="filter-group">
                                <label>Sort:</label>
                                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="value_desc">Highest Value</option>
                                    <option value="value_asc">Lowest Value</option>
                                    <option value="risk_desc">Safest (High Score)</option>
                                    <option value="risk_asc">Riskiest (Low Score)</option>
                                </select>
                            </div>
                        </div>

                        <div className="table-container">
                            <table className="market-table">
                                <thead>
                                    <tr>
                                        {columns.map(col => (
                                            <th key={col.key} className={col.className}>{col.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={columns.length} className="text-center p-4">Loading Market Data...</td></tr>
                                    ) : currentItems.length === 0 ? (
                                        <tr><td colSpan={columns.length} className="text-center p-4">No matching shipments found.</td></tr>
                                    ) : (
                                        currentItems.map((item, idx) => (
                                            <tr key={idx} onClick={() => handleRowClick(item)} className="market-row">
                                                <td className="font-mono">{item.blNumber}</td>
                                                <td>{item.shipper}</td>
                                                <td className="text-gray-400">{item.vessel}</td>
                                                <td className="text-sm">{item.route}</td>
                                                <td className="font-mono text-white">{formatCurrency(item.declaredValue)}</td>
                                                <td className="font-bold text-blue-400">{item.riskRating}</td>
                                                <td style={{ color: getRiskColor(item.riskValue) }}>{item.riskScore}</td>
                                                <td>{item.funded}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>

                            {/* Pagination Controls */}
                            {filteredShipments.length > 0 && (
                                <div className="pagination-controls">
                                    <button
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => p - 1)}
                                        className="page-btn"
                                    >
                                        &larr; Prev
                                    </button>
                                    <span className="page-info">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => p + 1)}
                                        className="page-btn"
                                    >
                                        Next &rarr;
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
        .dashboard-container {
          padding: 2rem;
          max-width: 1600px;
          margin: 0 auto;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        .page-title {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(135deg, #3b82f6 0%, #10b981 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .market-stats {
          display: flex;
          gap: 2rem;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        .stat-label {
          font-size: 0.8rem;
          color: var(--color-text-tertiary);
          text-transform: uppercase;
        }
        .stat-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-text-primary);
        }
        .table-container {
          overflow-x: auto;
        }
        .market-table {
          width: 100%;
          border-collapse: collapse;
        }
        .market-table th {
          text-align: left;
          padding: 1rem 1.5rem;
          border-bottom: 2px solid var(--color-border-default);
          color: var(--color-text-secondary);
          font-weight: 600;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .market-table td {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--color-border-default);
          color: var(--color-text-primary);
          transition: all 0.2s;
        }
        .market-row {
          cursor: pointer;
          transition: background 0.2s;
        }
        .market-row:hover {
          background: var(--color-background-secondary);
        }
        .market-row:hover td {
           color: #fff;
        }
        .font-mono {
          font-family: 'Monaco', 'Menlo', monospace;
        }
        .text-right {
          text-align: right;
        }
        .text-center {
          text-align: center;
        }
        .p-4 {
           padding: 2rem;
        }
        
        .text-green-500 { color: #10b981; }
        .text-yellow-500 { color: #f59e0b; }
        .text-red-500 { color: #ef4444; }
        .col-risk { width: 120px; color: var(--color-text-secondary); }

        /* Pagination */
        .pagination-controls {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 1.5rem;
            padding: 1.5rem;
            border-top: 1px solid var(--color-border-default);
            background: var(--color-background-tertiary);
            border-bottom-left-radius: var(--radius-lg);
            border-bottom-right-radius: var(--radius-lg);
        }

        .page-btn {
            background: var(--color-background-secondary);
            border: 1px solid var(--color-border-default);
            color: var(--color-text-primary);
            padding: 0.5rem 1rem;
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.9rem;
        }

        .page-btn:hover:not(:disabled) {
            background: var(--color-background-main);
            border-color: #3b82f6;
        }

        .page-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            color: var(--color-text-tertiary);
        }

        .page-info {
            color: var(--color-text-secondary);
            font-size: 0.9rem;
        }
        
        /* Filters Toolbar */
        .filters-toolbar {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--color-border-default);
            display: flex;
            align-items: center;
            gap: 2rem;
            background: var(--color-background-tertiary);
            border-top-left-radius: var(--radius-lg);
            border-top-right-radius: var(--radius-lg);
        }
        
        .search-box {
            position: relative;
            flex: 1;
            max-width: 400px;
        }
        
        .search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            width: 1.25rem;
            height: 1.25rem;
            color: var(--color-text-tertiary);
        }
        
        .search-box input {
            width: 100%;
            padding: 0.75rem 1rem 0.75rem 2.8rem;
            background: var(--color-background-main);
            border: 1px solid var(--color-border-default);
            border-radius: var(--radius-md);
            color: var(--color-text-primary);
            font-size: 0.95rem;
        }
        
        .search-box input:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        
        .filter-group {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .filter-group label {
            color: var(--color-text-secondary);
            font-size: 0.9rem;
            font-weight: 500;
        }
        
        .filter-group select {
            padding: 0.6rem 2rem 0.6rem 1rem;
            background: var(--color-background-main);
            border: 1px solid var(--color-border-default);
            border-radius: var(--radius-md);
            color: var(--color-text-primary);
            font-size: 0.9rem;
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 0.7rem center;
            background-size: 1em;
        }
      `}</style>
        </Layout >
    );
}

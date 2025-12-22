import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import { ICONS, CONFIG } from '../lib/config';

export default function Home() {
  const router = useRouter();
  const { currentAccount, addActivityLog } = useApp();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentAccount === 'carrier') {
      fetchShipments();
    }
  }, [currentAccount]);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${CONFIG.API_URL}/shipments`);
      if (!response.ok) {
        throw new Error('Failed to fetch shipments');
      }
      const data = await response.json();
      setShipments(data || []);
    } catch (error) {
      console.error('Error fetching shipments:', error);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShipment = () => {
    router.push('/upload');
  };

  // Home page automatically shows content based on currentAccount from AppContext
  // When navigating back from other pages, currentAccount is preserved in context
  // So the correct role content will be displayed automatically
  return (
    <Layout>
      {currentAccount === 'carrier' ? (
        <div id="carrier-content">
          <div className="action-section">
            <button className="create-shipment-btn" onClick={handleCreateShipment}>
              <svg className="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.plus} />
              </svg>
              <div className="btn-content">
                <div className="btn-title">Create Shipment</div>
                <div className="btn-subtitle">Upload eBL</div>
              </div>
            </button>
          </div>
          
          <div className="shipments-list">
            <h3 className="list-title">Current Shipments</h3>
            {loading ? (
              <div className="shipment-item">
                <div className="shipment-placeholder">Loading...</div>
              </div>
            ) : shipments.length === 0 ? (
              <div className="shipment-item">
                <div className="shipment-placeholder">No shipments yet</div>
              </div>
            ) : (
              shipments.map((shipment) => (
                <div key={shipment.id} className="shipment-item">
                  <div className="shipment-info">
                    <div className="shipment-bl-number">BL Number: {shipment.blNumber || 'N/A'}</div>
                    <div className="shipment-declared-value">Declared Value: {shipment.declaredValue || '0'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div id="other-content">
          <p className="empty-state">Content for other roles coming soon...</p>
        </div>
      )}
    </Layout>
  );
}


import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import { ICONS, CONFIG } from '../lib/config';

export default function Home() {
  const router = useRouter();
  const { currentAccount, addActivityLog, wallets, walletsLoading, setSelectedShipmentHash } = useApp();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch shipments for carrier, buyer, investor, and seller
    if (['carrier', 'buyer', 'investor', 'seller'].includes(currentAccount)) {
      fetchShipments();
    }
  }, [currentAccount, wallets, walletsLoading]);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      let url = `${CONFIG.API_URL}/shipments`;
      
      // Filter by role if we have wallet addresses
      if (wallets && !walletsLoading) {
        if (currentAccount === 'buyer' && wallets.buyer) {
          url += `?buyer=${wallets.buyer.address}`;
        } else if (currentAccount === 'seller' && wallets.seller) {
          url += `?seller=${wallets.seller.address}`;
        }
        // For carrier and investor, show all shipments
      }
      
      const response = await fetch(url);
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

  const handleShipmentClick = (shipment) => {
    setSelectedShipmentHash(shipment.bolHash);
    router.push('/shipment');
  };

  const formatValue = (value) => {
    if (!value) return '0';
    const num = parseFloat(value);
    return num.toLocaleString();
  };

  // Home page automatically shows content based on currentAccount from AppContext
  // When navigating back from other pages, currentAccount is preserved in context
  // So the correct role content will be displayed automatically
  return (
    <Layout>
      {['carrier', 'buyer', 'investor', 'seller'].includes(currentAccount) ? (
        <div id="shipments-content">
          {currentAccount === 'carrier' && (
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
          )}
          
          <div className="shipments-list">
            <h3 className="list-title">
              {currentAccount === 'carrier' ? 'Current Shipments' : 'My Shipments'}
            </h3>
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
                <div 
                  key={shipment.id} 
                  className="shipment-item clickable"
                  onClick={() => handleShipmentClick(shipment)}
                >
                  <div className="shipment-info">
                    <div className="shipment-bl-number">BL Number: {shipment.blNumber || 'N/A'}</div>
                    <div className="shipment-declared-value">Declared Value: {formatValue(shipment.declaredValue)}</div>
                    {shipment.isActive !== undefined && (
                      <div className="shipment-status">
                        Status: {shipment.isActive ? 'Active' : 'Inactive'}
                      </div>
                    )}
                  </div>
                  <svg className="shipment-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
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


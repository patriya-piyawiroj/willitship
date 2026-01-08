import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import { ICONS, CONFIG } from '../lib/config';

export default function Home() {
  const router = useRouter();
  const { currentAccount, addActivityLog, wallets, walletsLoading, setSelectedShipmentHash } = useApp();
  const { currentAccount, addActivityLog, wallets, walletsLoading, setSelectedShipmentHash } = useApp();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for new shipment from form page (optimistic update)
    const newShipmentData = sessionStorage.getItem('newShipment');
    if (newShipmentData) {
      try {
        const newShipment = JSON.parse(newShipmentData);
        // Add the new shipment optimistically to the list
        setShipments(prevShipments => {
          // Check if shipment already exists (by bolHash) to avoid duplicates
          const exists = prevShipments.some(s => s.bolHash === newShipment.bolHash || s.hash === newShipment.bolHash);
          if (exists) {
            return prevShipments;
          }
          // Add new shipment at the beginning of the list
          return [newShipment, ...prevShipments];
        });
        // Clear the sessionStorage after using it
        sessionStorage.removeItem('newShipment');
      } catch (error) {
        console.error('Error parsing new shipment data:', error);
        sessionStorage.removeItem('newShipment');
      }
    }

    // Fetch shipments for carrier, buyer, investor, and seller
    if (['carrier', 'buyer', 'investor', 'seller'].includes(currentAccount)) {
      fetchShipments();
    }
  }, [currentAccount, wallets, walletsLoading]);
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
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch shipments: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
      }
      
      const data = await response.json();
      
      // Merge with existing optimistic shipments, replacing optimistic ones with real data
      setShipments(prevShipments => {
        const newShipments = data || [];
        const optimisticShipments = prevShipments.filter(s => s.id && s.id.toString().startsWith('temp-'));
        
        // Create a map of real shipments by bolHash
        const realShipmentsMap = new Map();
        newShipments.forEach(shipment => {
          const hash = shipment.bolHash || shipment.hash;
          if (hash) {
            realShipmentsMap.set(hash, shipment);
          }
        });
        
        // Replace optimistic shipments with real ones if they exist
        const updatedOptimistic = optimisticShipments.map(optShipment => {
          const hash = optShipment.bolHash || optShipment.hash;
          return realShipmentsMap.get(hash) || optShipment;
        });
        
        // Combine: real shipments + updated optimistic shipments (that aren't in real data)
        const combined = [...newShipments];
        updatedOptimistic.forEach(optShipment => {
          const hash = optShipment.bolHash || optShipment.hash;
          if (!realShipmentsMap.has(hash)) {
            combined.push(optShipment);
          }
        });
        
        // Remove duplicates by bolHash
        const unique = Array.from(
          new Map(combined.map(s => {
            const hash = s.bolHash || s.hash;
            return [hash, s];
          })).values()
        );
        
        return unique;
      });
    } catch (error) {
      console.error('Error fetching shipments:', error);
      addActivityLog('Failed to fetch shipments', error.message || 'API may not be running. Please ensure the API service is started.', true);
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

  // Calculate funding percentage
  const getFundingPercentage = (shipment) => {
    if (!shipment.declaredValue || parseFloat(shipment.declaredValue) === 0) return 0;
    const funded = parseFloat(shipment.totalFunded || 0);
    const declared = parseFloat(shipment.declaredValue);
    return Math.min(100, Math.round((funded / declared) * 100));
  };

  // Determine current state for progress markers
  const getCurrentState = (shipment) => {
    // States: minted, funding_enabled, arrived, paid, settled
    // Use date fields to determine state, not amounts (amounts can change with offers)
    if (shipment.settledAt) return 'settled';
    if (shipment.paidAt) return 'paid'; // Only set when buyer calls pay()
    if (shipment.arrivedAt) return 'arrived'; // Only set when buyer calls surrender()
    if (shipment.fundingEnabledAt) return 'funding_enabled';
    if (shipment.mintedAt) return 'minted';
    return 'minted'; // Default: just minted
  };

  const getCurrentStateLabel = (shipment) => {
    const state = getCurrentState(shipment);
    const labels = {
      minted: 'Minted',
      funding_enabled: 'Funding Enabled',
      arrived: 'Arrived',
      paid: 'Paid',
      settled: 'Settled'
    };
    return labels[state] || 'Unknown';
  };

  // Get progress marker states with dates
  const getProgressStates = (shipment) => {
    const currentState = getCurrentState(shipment);
    const states = [
      { name: 'minted', date: shipment.mintedAt },
      { name: 'funding_enabled', date: shipment.fundingEnabledAt },
      { name: 'arrived', date: shipment.arrivedAt },
      { name: 'paid', date: shipment.paidAt },
      { name: 'settled', date: shipment.settledAt }
    ];
    return states.map((state, index) => {
      const stateNames = states.map(s => s.name);
      const currentIndex = stateNames.indexOf(currentState);
      return {
        name: state.name,
        date: state.date,
        completed: index <= currentIndex,
        current: state.name === currentState
      };
    });
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return null;
    }
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
              shipments.map((shipment) => {
                const fundingPercent = getFundingPercentage(shipment);
                const progressStates = getProgressStates(shipment);
                const isInactive = parseFloat(shipment.totalFunded || 0) === 0;
                
                return (
                  <div 
                    key={shipment.id} 
                    className="shipment-item clickable"
                    onClick={() => handleShipmentClick(shipment)}
                  >
                    <div className="shipment-left">
                      <div className="shipment-shipper-name">
                        {shipment.shipperName || 'N/A'}: #{shipment.blNumber || 'N/A'}
                      </div>

                      <div className="shipment-info-row">
                        <div className="info-field">
                          <div className="info-label">PLACE OF RECEIPT</div>
                          <div className="info-value">{shipment.placeOfReceipt || 'N/A'}</div>
                        </div>
                        <div className="info-field">
                          <div className="info-label">PLACE OF DELIVERY</div>
                          <div className="info-value">{shipment.placeOfDelivery || 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Markers */}
                    <div className="shipment-progress">
                      {progressStates.map((state, index) => {
                        // Determine which name to show above each marker
                        let roleName = null;
                        if (state.name === 'minted') {
                          roleName = shipment.carrierName || 'N/A';
                        } else if (state.name === 'funding_enabled') {
                          // Shipper is the seller, so use sellerName if available, otherwise shipperName
                          roleName = shipment.sellerName || shipment.shipperName || 'N/A';
                        } else if (['arrived', 'paid', 'settled'].includes(state.name)) {
                          roleName = shipment.buyerName || 'N/A';
                        }
                        
                        return (
                          <div key={state.name} className="progress-marker-group">
                            {roleName && (
                              <div className={`progress-role-name ${state.completed ? 'completed' : 'pending'}`}>
                                {roleName}
                              </div>
                            )}
                            <div className={`progress-marker ${state.completed ? 'completed' : ''} ${state.current ? 'current' : ''}`}>
                              {state.completed && (
                                <svg className="progress-check" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.check} />
                                </svg>
                              )}
                            </div>
                            <div className="progress-label-container">
                              <div className={`progress-label ${state.completed ? 'completed' : 'pending'}`}>
                                {state.name.replace('_', ' ')}
                              </div>
                              <div className="progress-date">
                                {state.date ? formatDate(state.date) : '\u00A0'}
                              </div>
                              {/* Location chips for minted and arrived */}
                            </div>
                            {index < progressStates.length - 1 && (
                              <div className={`progress-line ${state.completed && progressStates[index + 1].completed ? 'completed' : ''} ${index === progressStates.length - 2 && progressStates[progressStates.length - 1].completed ? 'last-segment' : ''}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <svg className="shipment-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                );
              })
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


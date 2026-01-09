import { createContext, useContext, useState, useEffect } from 'react';
import { useWallets } from '../hooks/useWallets';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [currentAccount, setCurrentAccount] = useState('buyer');
  const [activityLog, setActivityLog] = useState([]);
  const [selectedShipmentHash, setSelectedShipmentHash] = useState(null);
  const { wallets: walletsData, loading: walletsLoading, error, refreshWallets } = useWallets();

  // Convert wallets array to object keyed by account type if it's an array
  const wallets = Array.isArray(walletsData) ? walletsData.reduce((acc, wallet) => {
    acc[wallet.id || wallet.accountType] = wallet;
    return acc;
  }, {}) : walletsData;
  
  const addActivityLog = (message, details = null, isError = false) => {
    const entry = {
      time: new Date().toLocaleTimeString(),
      message,
      details,
      isError
    };
    setActivityLog(prev => {
      const updated = [entry, ...prev];
      return updated.slice(0, 20); // Keep last 20 entries
    });
  };
  
  // Log wallet loading errors to activity log
  useEffect(() => {
    if (error && !walletsLoading) {
      addActivityLog('Failed to load wallets', error, true);
    }
  }, [error, walletsLoading]);

  // Initialize activity log on client side only to avoid hydration mismatch
  useEffect(() => {
    setActivityLog([{ time: new Date().toLocaleTimeString(), message: 'App initialized', isError: false }]);
  }, []);

  // Note: Account switching no longer adds to activity log

  const value = {
    currentAccount,
    setCurrentAccount,
    wallets,
    walletsLoading,
    refreshWallets,
    activityLog,
    addActivityLog,
    selectedShipmentHash,
    setSelectedShipmentHash
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}


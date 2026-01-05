import { useState, useEffect } from 'react';
import { CONFIG } from '../lib/config';

const API_URL = CONFIG.API_URL;

export function useWallets() {
  const [wallets, setWallets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadWallets() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/wallets`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setWallets(data);
      setError(null);
    } catch (err) {
      console.error('Error loading wallets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load wallets once on mount
    loadWallets();
  }, []);

  return { wallets, loading, error, refreshWallets: loadWallets };
}


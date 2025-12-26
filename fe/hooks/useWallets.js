import { useState, useEffect } from 'react';
import { CONFIG } from '../lib/config';

const API_URL = CONFIG.API_URL;

export function useWallets() {
  const [wallets, setWallets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadWallets() {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await fetch(`${API_URL}/wallets`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setWallets(data);
        setError(null);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (err) {
      console.error('Error loading wallets:', err);
      // Handle network errors gracefully
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check if the API service is running on ' + API_URL);
      } else if (err.name === 'TypeError' && (err.message === 'Failed to fetch' || err.message.includes('fetch'))) {
        setError('Unable to connect to API. Please ensure the API service is running on ' + API_URL);
      } else {
        setError(err.message || 'Unknown error occurred');
      }
      // Set wallets to null on error so components can handle the error state
      setWallets(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load wallets once on mount (only in browser)
    if (typeof window !== 'undefined') {
      loadWallets().catch(err => {
        // Silently handle errors to prevent unhandled promise rejections
        console.error('Error in loadWallets:', err);
      });
    }
  }, []);

  return { wallets, loading, error, refreshWallets: loadWallets };
}


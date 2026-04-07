'use client';

import { useState, useEffect } from 'react';
import { EnrichedMarket } from '@/types';
import { getFallbackMarkets } from '@/lib/polymarket';

export function useMarkets() {
  const [markets, setMarkets] = useState<EnrichedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const fetchMarkets = async () => {
    try {
      const res = await fetch('/api/markets');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (data.markets?.length > 0) {
        setMarkets(data.markets);
        setLastUpdated(data.timestamp);
        setError(null);
      } else {
        // Use fallback if API returns empty
        setMarkets(getFallbackMarkets());
      }
    } catch {
      setError('Using cached data');
      setMarkets(getFallbackMarkets());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
    // Poll every 60 seconds for live prices
    const interval = setInterval(fetchMarkets, 60_000);
    return () => clearInterval(interval);
  }, []);

  return { markets, loading, error, lastUpdated, refresh: fetchMarkets };
}

export function useINRRate() {
  const [rate, setRate] = useState(83.7);

  useEffect(() => {
    fetch('/api/rate')
      .then(r => r.json())
      .then(d => { if (d.rate) setRate(d.rate); })
      .catch(() => {});

    const interval = setInterval(() => {
      fetch('/api/rate')
        .then(r => r.json())
        .then(d => { if (d.rate) setRate(d.rate); })
        .catch(() => {});
    }, 300_000); // every 5 min

    return () => clearInterval(interval);
  }, []);

  return rate;
}

// Task 6.3.1: Create useConfigurationStatus hook
// Task 6.3.2: Fetch configuration status on app startup
// Task 6.3.3: Cache configuration status in localStorage
// Task 6.3.4: Provide configuration status to components

'use client';

import { useState, useEffect, useCallback } from 'react';

interface ConfigurationStatus {
  isConfigured: boolean;
  configurationLevel: 'none' | 'partial' | 'complete';
  hasAccessKeyId: boolean;
  hasSecretAccessKey: boolean;
  hasRegion: boolean;
  missingVariables: string[];
  timestamp: string;
  message: string;
}

interface ConfigurationCache {
  data: ConfigurationStatus;
  timestamp: number;
  expiry: number;
}

interface UseConfigurationStatusOptions {
  autoFetch?: boolean;
  cacheTimeout?: number; // in milliseconds
}

interface UseConfigurationStatusReturn {
  status: ConfigurationStatus | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshStatus: () => Promise<void>;
  isStale: boolean;
  cacheInfo: {
    cached: boolean;
    age: number; // in milliseconds
    remainingTime: number; // in milliseconds
  };
}

const CACHE_KEY = 'aws-configuration-status';
const DEFAULT_CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Task 6.3.3: Cache configuration status in localStorage
 */
function getCachedStatus(cacheTimeout: number): ConfigurationStatus | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const cacheData: ConfigurationCache = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now > cacheData.expiry) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return cacheData.data;
  } catch (error) {
    console.warn('Failed to read cached configuration status:', error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

/**
 * Task 6.3.3: Store configuration status in localStorage
 */
function setCachedStatus(status: ConfigurationStatus, cacheTimeout: number): void {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheData: ConfigurationCache = {
      data: status,
      timestamp: Date.now(),
      expiry: Date.now() + cacheTimeout
    };
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Failed to cache configuration status:', error);
  }
}

/**
 * Task 6.4.4: Clear cache when configuration changes
 */
function clearCachedStatus(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('Failed to clear cached configuration status:', error);
  }
}

/**
 * Get cache information for debugging/display
 */
function getCacheInfo(cacheTimeout: number): UseConfigurationStatusReturn['cacheInfo'] {
  if (typeof window === 'undefined') {
    return { cached: false, age: 0, remainingTime: 0 };
  }
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return { cached: false, age: 0, remainingTime: 0 };
    }
    
    const cacheData: ConfigurationCache = JSON.parse(cached);
    const now = Date.now();
    const age = now - cacheData.timestamp;
    const remainingTime = Math.max(0, cacheData.expiry - now);
    
    return { 
      cached: true, 
      age, 
      remainingTime 
    };
  } catch (error) {
    return { cached: false, age: 0, remainingTime: 0 };
  }
}

/**
 * Task 6.3.1: Create useConfigurationStatus hook
 */
export function useConfigurationStatus(options: UseConfigurationStatusOptions = {}): UseConfigurationStatusReturn {
  const {
    autoFetch = true,
    cacheTimeout = DEFAULT_CACHE_TIMEOUT
  } = options;
  
  const [status, setStatus] = useState<ConfigurationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Task 6.4.2: Check cache expiry before fetching status
  const isStale = useCallback(() => {
    const cacheInfo = getCacheInfo(cacheTimeout);
    return !cacheInfo.cached || cacheInfo.remainingTime <= 0;
  }, [cacheTimeout]);
  
  /**
   * Task 6.3.2: Fetch configuration status from API
   */
  const fetchConfigurationStatus = useCallback(async (forceRefresh = false): Promise<void> => {
    // Task 6.4.2: Check cache expiry before fetching status
    if (!forceRefresh && !isStale()) {
      const cachedStatus = getCachedStatus(cacheTimeout);
      if (cachedStatus) {
        setStatus(cachedStatus);
        setLastUpdated(new Date(cachedStatus.timestamp));
        return;
      }
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/aws/configuration/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: forceRefresh ? 'no-cache' : 'default'
      });
      
      if (!response.ok) {
        throw new Error(`Configuration status check failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Unknown error occurred');
      }
      
      const configStatus: ConfigurationStatus = result.data;
      
      // Task 6.4.3: Update cache timestamp on successful fetch
      setCachedStatus(configStatus, cacheTimeout);
      setStatus(configStatus);
      setLastUpdated(new Date());
      setError(null);
      
    } catch (fetchError) {
      const errorMessage = (fetchError as Error).message;
      console.error('Failed to fetch configuration status:', fetchError);
      setError(errorMessage);
      
      // On error, try to use cached status if available
      const cachedStatus = getCachedStatus(cacheTimeout);
      if (cachedStatus) {
        setStatus(cachedStatus);
        setLastUpdated(new Date(cachedStatus.timestamp));
      }
    } finally {
      setIsLoading(false);
    }
  }, [cacheTimeout, isStale]);
  
  const refreshStatus = useCallback(async (): Promise<void> => {
    await fetchConfigurationStatus(true);
  }, [fetchConfigurationStatus]);
  
  // Task 6.3.2: Fetch configuration status on app startup
  useEffect(() => {
    if (autoFetch) {
      fetchConfigurationStatus(false);
    }
  }, [autoFetch, fetchConfigurationStatus]);
  
  // Initialize with cached data immediately (if available)
  useEffect(() => {
    const cachedStatus = getCachedStatus(cacheTimeout);
    if (cachedStatus && !status) {
      setStatus(cachedStatus);
      setLastUpdated(new Date(cachedStatus.timestamp));
    }
  }, [cacheTimeout, status]);
  
  return {
    status,
    isLoading,
    error,
    lastUpdated,
    refreshStatus,
    isStale: isStale(),
    cacheInfo: getCacheInfo(cacheTimeout)
  };
}

/**
 * Task 6.4.4: Clear cache when configuration changes (utility function)
 */
export function clearConfigurationCache(): void {
  clearCachedStatus();
}

export type { ConfigurationStatus, UseConfigurationStatusOptions, UseConfigurationStatusReturn }; 
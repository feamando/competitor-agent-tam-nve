'use client';

/**
 * Logout Button - Header logout component with profile session clearing
 * Part of TP-026 Basic User Profiles Implementation
 */

import React, { useState } from 'react';
import { useProfile } from './ProfileProvider';

interface LogoutButtonProps {
  className?: string;
  showEmail?: boolean;
}

export function LogoutButton({ className = '', showEmail = true }: LogoutButtonProps) {
  const { profile, logout, sessionTimeRemaining } = useProfile();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!profile) {
    return null; // Don't show logout button if not authenticated
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const formatTimeRemaining = (minutes: number): string => {
    if (minutes <= 0) return 'Expired';
    if (minutes < 60) return `${minutes}m left`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m left`;
  };

  const isExpiringSoon = sessionTimeRemaining > 0 && sessionTimeRemaining <= 60;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showEmail && (
        <div className="flex flex-col items-end text-sm">
          <span className="text-gray-700 font-medium">
            {profile.name || profile.email}
          </span>
          <span className={`text-xs ${isExpiringSoon ? 'text-amber-600' : 'text-gray-500'}`}>
            {formatTimeRemaining(sessionTimeRemaining)}
          </span>
        </div>
      )}
      
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title={`Logout from ${profile.email}`}
      >
        {isLoggingOut ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        )}
        <span className="ml-2">
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </span>
      </button>
    </div>
  );
}

// Compact version for mobile or tight spaces
export function CompactLogoutButton({ className = '' }: { className?: string }) {
  const { profile, logout } = useProfile();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!profile) return null;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={`p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${className}`}
      title={`Logout from ${profile.email}`}
    >
      {isLoggingOut ? (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      )}
    </button>
  );
}

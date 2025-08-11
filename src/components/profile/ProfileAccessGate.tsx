'use client';

/**
 * Profile Access Gate - Main application layout with profile access control
 * Part of TP-026 Basic User Profiles Implementation
 */

import React, { useState } from 'react';
import { useProfile } from './ProfileProvider';
import { ProfileAccessModal } from './ProfileAccessModal';

interface ProfileAccessGateProps {
  children: React.ReactNode;
}

export function ProfileAccessGate({ children }: ProfileAccessGateProps) {
  const { profile, isLoading, isAuthenticated, login } = useProfile();
  const [showModal, setShowModal] = useState(false);

  // Show loading spinner while checking session
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // Show access gate if not authenticated
  if (!isAuthenticated || !profile) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="max-w-md w-full mx-4">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Competitor Research Agent
              </h1>
              <p className="text-gray-600">
                Your personal workspace for competitive intelligence
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-center mb-6">
                <svg className="w-16 h-16 text-blue-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Secure Access Required
                </h2>
                <p className="text-gray-600 mb-6">
                  Enter your email to access your personalized workspace. Your data is kept separate and secure.
                </p>
              </div>

              <button
                onClick={() => setShowModal(true)}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium"
              >
                Access Your Workspace
              </button>

              <div className="mt-6 text-xs text-gray-500 space-y-1">
                <p>✓ Email-based profile system</p>
                <p>✓ Automatic data organization</p>
                <p>✓ 24-hour secure sessions</p>
                <p>✓ Complete data isolation</p>
              </div>
            </div>
          </div>
        </div>

        <ProfileAccessModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          login={login}
          onSuccess={() => setShowModal(false)}
        />
      </>
    );
  }

  // User is authenticated, show the application
  return <>{children}</>;
}

// Session warning component for when session is about to expire
export function SessionWarning() {
  const { sessionTimeRemaining, refreshSession } = useProfile();
  const [isDismissed, setIsDismissed] = useState(false);

  // Show warning when less than 15 minutes remain
  const showWarning = sessionTimeRemaining > 0 && sessionTimeRemaining <= 15 && !isDismissed;

  if (!showWarning) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white px-4 py-2 z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm font-medium">
            Your session expires in {sessionTimeRemaining} minutes
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={refreshSession}
            className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-sm font-medium"
          >
            Extend Session
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="text-amber-100 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

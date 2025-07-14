'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useDeleteCompetitor } from '@/hooks/useDeleteCompetitor';

interface DeleteCompetitorButtonProps {
  competitorId: string;
  competitorName: string;
  onDeleteSuccess?: () => void;
  onDeleteError?: (error: string) => void;
  className?: string;
}

/**
 * Delete Competitor Button Component
 * 
 * Renders a delete button that shows a confirmation modal before deletion.
 * Includes proper loading states, error handling, and accessibility features.
 */
export default function DeleteCompetitorButton({
  competitorId,
  competitorName,
  onDeleteSuccess,
  onDeleteError,
  className = ''
}: DeleteCompetitorButtonProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const router = useRouter();
  const { deleteCompetitor, isDeleting, error } = useDeleteCompetitor();
  
  // Refs for focus management
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus the confirm button when modal opens
  useEffect(() => {
    if (showConfirmModal && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [showConfirmModal]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showConfirmModal) {
        handleCancelDelete();
      }
    };

    if (showConfirmModal) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [showConfirmModal]);

  const handleDeleteClick = () => {
    setLocalError(null);
    setShowConfirmModal(true);
  };

  const handleCancelDelete = () => {
    setShowConfirmModal(false);
    setLocalError(null);
    // Return focus to delete button
    if (deleteButtonRef.current) {
      deleteButtonRef.current.focus();
    }
  };

  const handleConfirmDelete = async () => {
    try {
      const result = await deleteCompetitor(competitorId);
      
      if (result.success) {
        setShowConfirmModal(false);
        
        // Call success callback if provided
        if (onDeleteSuccess) {
          onDeleteSuccess();
        }
        
        // Navigate to competitors list
        router.push('/competitors');
        router.refresh(); // Refresh to update the list
      } else {
        // Handle deletion failure
        const errorMessage = result.message || 'Failed to delete competitor';
        setLocalError(errorMessage);
        
        if (onDeleteError) {
          onDeleteError(errorMessage);
        }
      }
    } catch (err) {
      const errorMessage = 'An unexpected error occurred';
      setLocalError(errorMessage);
      
      if (onDeleteError) {
        onDeleteError(errorMessage);
      }
    }
  };

  // Handle click outside modal to close
  const handleModalBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleCancelDelete();
    }
  };

  const displayError = localError || error;

  return (
    <>
      {/* Delete Button */}
      <button
        ref={deleteButtonRef}
        onClick={handleDeleteClick}
        disabled={isDeleting}
        className={`
          inline-flex items-center justify-center rounded-md border border-transparent 
          bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm 
          hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 
          focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          ${className}
        `}
        aria-describedby={displayError ? 'delete-error' : undefined}
      >
        <TrashIcon className="h-4 w-4 mr-2" aria-hidden="true" />
        {isDeleting ? 'Deleting...' : 'Delete Competitor'}
      </button>

      {/* Error Message */}
      {displayError && (
        <div
          id="delete-error"
          className="mt-2 text-sm text-red-600"
          role="alert"
          aria-live="polite"
        >
          {displayError}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-labelledby="modal-title"
          aria-describedby="modal-description"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            onClick={handleModalBackdropClick}
          />

          {/* Modal */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div
              ref={modalRef}
              className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
            >
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <ExclamationTriangleIcon
                      className="h-6 w-6 text-red-600"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3
                      className="text-base font-semibold leading-6 text-gray-900"
                      id="modal-title"
                    >
                      Delete Competitor
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500" id="modal-description">
                        Are you sure you want to delete{' '}
                        <span className="font-medium text-gray-900">
                          {competitorName}
                        </span>
                        ? This action cannot be undone and will permanently remove all
                        associated data including snapshots and reports.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Error Message */}
              {displayError && (
                <div className="px-4 sm:px-6">
                  <div
                    className="rounded-md bg-red-50 p-4"
                    role="alert"
                    aria-live="polite"
                  >
                    <div className="text-sm text-red-800">{displayError}</div>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  ref={confirmButtonRef}
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed sm:ml-3 sm:w-auto"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 
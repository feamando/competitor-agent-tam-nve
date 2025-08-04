// Task 7.1.1: Create SkeletonLoader component
// Task 7.1.4: Add smooth transition animation

'use client';

import React from 'react';

interface SkeletonLoaderProps {
  mode?: 'compact' | 'detailed' | 'card';
  className?: string;
}

/**
 * Task 7.1.1: Create SkeletonLoader component
 * Provides animated skeleton loading states for AWS status indicator
 */
export function SkeletonLoader({ mode = 'compact', className = '' }: SkeletonLoaderProps) {
  const shimmerAnimation = 'animate-pulse';
  const baseSkeletonClass = 'bg-gray-200 rounded';
  
  const renderCompactSkeleton = () => (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-50 border border-gray-200 ${className}`}>
      {/* Skeleton dot */}
      <div className={`w-2 h-2 rounded-full ${baseSkeletonClass} ${shimmerAnimation}`} />
      
      {/* Skeleton text */}
      <div className={`h-4 w-20 ${baseSkeletonClass} ${shimmerAnimation}`} />
      
      {/* Skeleton refresh button */}
      <div className={`w-4 h-4 rounded ${baseSkeletonClass} ${shimmerAnimation}`} />
    </div>
  );

  const renderDetailedSkeleton = () => (
    <div className={`p-4 rounded-lg bg-gray-50 border border-gray-200 ${className}`}>
      {/* Header section */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Skeleton dot */}
          <div className={`w-3 h-3 rounded-full ${baseSkeletonClass} ${shimmerAnimation}`} />
          <div>
            {/* Title skeleton */}
            <div className={`h-5 w-32 ${baseSkeletonClass} ${shimmerAnimation} mb-1`} />
            {/* Subtitle skeleton */}
            <div className={`h-4 w-24 ${baseSkeletonClass} ${shimmerAnimation}`} />
          </div>
        </div>
        
        {/* Button skeleton */}
        <div className={`h-8 w-16 rounded ${baseSkeletonClass} ${shimmerAnimation}`} />
      </div>

      {/* Content grid skeleton */}
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          {/* Configuration row */}
          <div className="flex items-center gap-2">
            <div className={`h-4 w-16 ${baseSkeletonClass} ${shimmerAnimation}`} />
            <div className={`h-4 w-20 ${baseSkeletonClass} ${shimmerAnimation}`} />
          </div>
          
          {/* Credentials row */}
          <div className="flex items-center gap-2">
            <div className={`h-4 w-16 ${baseSkeletonClass} ${shimmerAnimation}`} />
            <div className={`h-4 w-12 ${baseSkeletonClass} ${shimmerAnimation}`} />
          </div>
          
          {/* Region row */}
          <div className="flex items-center gap-2">
            <div className={`h-4 w-12 ${baseSkeletonClass} ${shimmerAnimation}`} />
            <div className={`h-4 w-16 ${baseSkeletonClass} ${shimmerAnimation}`} />
          </div>
          
          {/* Latency row */}
          <div className="flex items-center gap-2">
            <div className={`h-4 w-14 ${baseSkeletonClass} ${shimmerAnimation}`} />
            <div className={`h-4 w-10 ${baseSkeletonClass} ${shimmerAnimation}`} />
          </div>
        </div>

        {/* Last checked skeleton */}
        <div className="pt-2 border-t border-gray-200">
          <div className={`h-3 w-28 ${baseSkeletonClass} ${shimmerAnimation}`} />
        </div>
      </div>
    </div>
  );

  const renderCardSkeleton = () => (
    <div className={`p-6 rounded-xl shadow-sm bg-gray-50 border border-gray-200 ${className}`}>
      {/* Header section */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Skeleton dot */}
          <div className={`w-4 h-4 rounded-full ${baseSkeletonClass} ${shimmerAnimation}`} />
          {/* Title skeleton */}
          <div className={`h-6 w-28 ${baseSkeletonClass} ${shimmerAnimation}`} />
        </div>
        
        {/* Icon skeleton */}
        <div className={`w-8 h-8 rounded ${baseSkeletonClass} ${shimmerAnimation}`} />
      </div>

      {/* Status message skeleton */}
      <div className={`h-4 w-36 mb-4 ${baseSkeletonClass} ${shimmerAnimation}`} />

      {/* Stats grid skeleton */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between">
              <div className={`h-4 w-16 ${baseSkeletonClass} ${shimmerAnimation}`} />
              <div className={`h-4 w-8 ${baseSkeletonClass} ${shimmerAnimation}`} />
            </div>
          ))}
        </div>

        {/* Footer section skeleton */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
          <div className={`h-3 w-24 ${baseSkeletonClass} ${shimmerAnimation}`} />
          <div className="flex gap-2">
            <div className={`h-6 w-12 rounded ${baseSkeletonClass} ${shimmerAnimation}`} />
            <div className={`h-6 w-16 rounded ${baseSkeletonClass} ${shimmerAnimation}`} />
          </div>
        </div>
      </div>
    </div>
  );

  // Task 7.1.4: Add smooth transition animation with fade-in effect
  const renderWithTransition = (content: React.ReactNode) => (
    <div className="transition-opacity duration-300 ease-in-out">
      {content}
    </div>
  );

  switch (mode) {
    case 'detailed':
      return renderWithTransition(renderDetailedSkeleton());
    case 'card':
      return renderWithTransition(renderCardSkeleton());
    case 'compact':
    default:
      return renderWithTransition(renderCompactSkeleton());
  }
}

export default SkeletonLoader; 
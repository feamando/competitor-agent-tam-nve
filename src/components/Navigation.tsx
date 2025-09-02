/**
 * Legacy Navigation Component - Backwards Compatibility Wrapper
 * This component maintains backwards compatibility while gradually migrating to the new design system
 * Part of Phase 4: Migration & Integration (Task 7.4)
 */

'use client'

import * as React from 'react';
import { Navigation as NewNavigation } from '@/components/composed/Navigation';
import { 
  withProgressiveEnhancement, 
  withMigrationWarning,
  trackMigrationEvent,
} from '@/lib/design-system/migration-utils';

// Legacy implementation (fallback)
import Link from 'next/link'
import { HomeIcon, DocumentTextIcon, UserGroupIcon, ChatBubbleLeftRightIcon, FolderIcon } from '@heroicons/react/24/outline'
import { LogoutButton } from '@/components/profile/LogoutButton'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Chat Agent', href: '/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Competitors', href: '/competitors', icon: UserGroupIcon },
  { name: 'Reports', href: '/reports', icon: DocumentTextIcon },
]

function LegacyNavigation() {
  React.useEffect(() => {
    trackMigrationEvent({
      componentName: 'Navigation',
      action: 'deprecated_used'
    });
  }, []);

  return (
    <nav className="bg-white shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold" style={{ color: '#067A46' }}>
                CompAI
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-green-600 dark:text-gray-100 dark:hover:text-green-400"
                >
                  <item.icon className="mr-2 h-5 w-5" />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Competitor Research Agent
            </div>
            <LogoutButton />
          </div>
        </div>
      </div>
    </nav>
  )
}

// Enhanced Navigation with progressive enhancement
const EnhancedNavigation = withProgressiveEnhancement(
  LegacyNavigation,
  NewNavigation,
  'newNavigation',
  true // Enable fallback on error
);

// Navigation with deprecation warning
const NavigationWithWarning = withMigrationWarning(
  EnhancedNavigation,
  'Navigation',
  '@/components/composed/Navigation',
  '2.0.0'
);

export function Navigation() {
  return <NavigationWithWarning />;
}

// Add default export for compatibility
export default Navigation; 
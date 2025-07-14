'use client'

import Link from 'next/link'
import { HomeIcon, DocumentTextIcon, UserGroupIcon, ChatBubbleLeftRightIcon, FolderIcon } from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Chat Agent', href: '/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Competitors', href: '/competitors', icon: UserGroupIcon },
  { name: 'Reports', href: '/reports', icon: DocumentTextIcon },
]

export function Navigation() {
  return (
    <nav className="bg-white shadow-sm">
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
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-green-600"
                >
                  <item.icon className="mr-2 h-5 w-5" />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Competitor Research Agent
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}

// Add default export for compatibility
export default Navigation; 
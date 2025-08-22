'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'

interface Competitor {
  id: string
  name: string
  website: string
  description?: string
  createdAt: string
}

interface PaginationData {
  total: number
  pages: number
  page: number
  limit: number
}

function CompetitorsListContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [pagination, setPagination] = useState<PaginationData>()
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState(searchParams?.get('search') || '')

  const currentPage = parseInt(searchParams?.get('page') || '1')

  useEffect(() => {
    const fetchCompetitors = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '10',
          search: searchTerm,
        })

        const response = await fetch(`/api/competitors?${params}`)
        if (!response.ok) throw new Error('Failed to fetch competitors')
        
        const data = await response.json()
        console.log('API response:', data) // Debug log
        
        // Ensure we have valid data structure
        if (data && Array.isArray(data.competitors)) {
          setCompetitors(data.competitors)
          setPagination(data.pagination)
        } else {
          console.error('Invalid API response structure:', data)
          setCompetitors([]) // Fallback to empty array
        }
      } catch (error) {
        console.error('Error fetching competitors:', error)
        setCompetitors([]) // Ensure we set an empty array on error
      } finally {
        setIsLoading(false)
      }
    }

    fetchCompetitors()
  }, [currentPage, searchTerm])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/competitors?search=${encodeURIComponent(searchTerm)}&page=1`)
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Competitors</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all competitors being monitored for analysis and reporting.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Link
            href="/competitors/add"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:w-auto"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Add Competitor
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <form onSubmit={handleSearch} className="max-w-md">
          <div className="relative rounded-md shadow-sm">
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 pr-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Search competitors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
          </div>
        </form>
      </div>

      <div className="mt-8 flex flex-col">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      URL
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Added
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-4">
                        Loading...
                      </td>
                    </tr>
                  ) : !competitors || competitors.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-gray-500">
                        No competitors found
                      </td>
                    </tr>
                  ) : (
                    competitors.map((competitor) => (
                      <tr key={competitor.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                          {competitor.name}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          <a href={competitor.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                            {new URL(competitor.website).hostname}
                          </a>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {new Date(competitor.createdAt).toLocaleDateString()}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <Link
                            href={`/competitors/${competitor.id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View<span className="sr-only">, {competitor.name}</span>
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => router.push(`/competitors?page=${currentPage - 1}&search=${searchTerm}`)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => router.push(`/competitors?page=${currentPage + 1}&search=${searchTerm}`)}
              disabled={currentPage === pagination.pages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{((currentPage - 1) * 10) + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * 10, pagination.total)}
                </span>{' '}
                of <span className="font-medium">{pagination.total}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => router.push(`/competitors?page=${page}&search=${searchTerm}`)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                      page === currentPage
                        ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                        : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompetitorsList() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompetitorsListContent />
    </Suspense>
  )
} 
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, DocumentTextIcon, UserGroupIcon, CalendarIcon } from '@heroicons/react/24/outline';

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  competitors: Array<{
    id: string;
    name: string;
    website: string;
    industry: string;
  }>;
  reports: Array<{
    id: string;
    name: string;
    title: string;
    status: string;
    createdAt: string;
    isInitialReport: boolean;
    dataCompletenessScore: number;
  }>;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      if (!params?.id) {
        setError('Invalid project ID');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/projects/${params.id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('Project not found');
          } else {
            setError('Failed to load project');
          }
          return;
        }
        
        const data = await response.json();
        setProject(data);
      } catch (err) {
        setError('Failed to load project');
        console.error('Error fetching project:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [params?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2 mb-8"></div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="h-6 bg-gray-300 rounded w-1/3 mb-4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-300 rounded"></div>
                <div className="h-4 bg-gray-300 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/projects"
            className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
          
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Error
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => router.push('/projects')}
                    className="bg-red-100 px-3 py-1 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
                  >
                    Go to Projects
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Navigation */}
        <Link
          href="/projects"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back to Projects
        </Link>

        {/* Project Header */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                <p className="mt-1 text-sm text-gray-500">{project.description}</p>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  project.status === 'ACTIVE' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {project.status}
                </span>
                <p className="mt-1 text-xs text-gray-500">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Reports Section */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900 flex items-center">
                  <DocumentTextIcon className="mr-2 h-5 w-5" />
                  Reports ({project.reports.length})
                </h2>
              </div>
              <div className="p-6">
                {project.reports.length === 0 ? (
                  <div className="text-center py-8">
                    <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No reports yet</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Reports will appear here once generated.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {project.reports.map((report) => (
                      <div key={report.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-medium text-gray-900">
                              {report.title || report.name}
                            </h3>
                            <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                              <span className="flex items-center">
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                {new Date(report.createdAt).toLocaleDateString()}
                              </span>
                              {report.isInitialReport && (
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  Initial Report
                                </span>
                              )}
                              <span>
                                Completeness: {report.dataCompletenessScore}%
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              report.status === 'COMPLETED' 
                                ? 'bg-green-100 text-green-800' 
                                : report.status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {report.status}
                            </span>
                            <Link
                              href={`/reports/${report.id}`}
                              className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
                            >
                              View
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Competitors */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900 flex items-center">
                  <UserGroupIcon className="mr-2 h-5 w-5" />
                  Competitors ({project.competitors.length})
                </h2>
              </div>
              <div className="p-6">
                {project.competitors.length === 0 ? (
                  <p className="text-sm text-gray-500">No competitors assigned</p>
                ) : (
                  <div className="space-y-3">
                    {project.competitors.map((competitor) => (
                      <div key={competitor.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{competitor.name}</p>
                          <p className="text-xs text-gray-500">{competitor.industry}</p>
                        </div>
                        <a
                          href={competitor.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-500"
                        >
                          Visit
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Project Info */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Project Info</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(project.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(project.updatedAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1 text-sm text-gray-900">{project.status}</dd>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
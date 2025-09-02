'use client';

import Link from 'next/link'
import { useState, useEffect } from 'react';
import { useProfile } from '@/components/profile/ProfileProvider';

interface ReportFile {
  filename: string;
  projectId: string;
  generatedAt: string;
  size: number;
  downloadUrl: string;
}

export default function Home() {
  const [recentReports, setRecentReports] = useState<ReportFile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Get profile session for API calls
  const { session, isAuthenticated } = useProfile();

  useEffect(() => {
    fetchRecentReports();
  }, [session, isAuthenticated]); // Re-fetch when session changes

  const fetchRecentReports = async () => {
    try {
      // Only fetch if user is authenticated with a profile session
      if (!isAuthenticated || !session?.profileId) {
        setRecentReports([]);
        setLoading(false);
        return;
      }
      
      const response = await fetch('/api/reports/list?limit=3', {
        headers: {
          'x-profile-id': session.profileId
        }
      });
      const data = await response.json();
      
      if (response.ok) {
        // Get the 3 most recent reports
        setRecentReports((data.reports || []));
      }
    } catch (error) {
      console.error('Failed to fetch recent reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Competitor Research Dashboard
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Automate your competitive intelligence with our intelligent agent. 
          Set up projects, schedule reports, and get insights that help you stay ahead.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Chat Agent Card - Featured */}
        <div className="md:col-span-2 lg:col-span-1 p-6 rounded-lg shadow-md text-white" style={{ background: 'linear-gradient(to right, #067A46, #067A46)' }}>
          <h2 className="text-xl font-semibold mb-4">🤖 AI Chat Agent</h2>
          <p className="text-green-100 mb-4">
            Start a conversation with our AI agent to set up automated competitor research projects.
          </p>
          <Link 
            href="/chat" 
            className="block w-full text-center bg-black text-white py-2 px-4 rounded hover:bg-gray-800 transition font-medium"
          >
            Start Chat Session
          </Link>
        </div>

        {/* Quick Actions Card */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link 
              href="/chat" 
              className="block w-full text-center bg-black text-white py-2 px-4 rounded hover:bg-gray-800 transition"
            >
              New Analysis Project
            </Link>
            <Link 
              href="/reports" 
              className="block w-full text-center border border-black text-black py-2 px-4 rounded hover:bg-gray-100 transition"
            >
              View All Reports
            </Link>
          </div>
        </div>

        {/* Recent Reports Card */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Reports</h2>
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: '#067A46' }}></div>
            </div>
          ) : recentReports.length === 0 ? (
            <div className="space-y-3">
              <p className="text-gray-600">No reports generated yet</p>
              <p className="text-sm text-gray-500">
                Use the Chat Agent to set up your first automated competitor analysis project.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <div key={report.filename} className="border-l-4 pl-3" style={{ borderColor: '#067A46' }}>
                  <p className="text-sm font-medium text-gray-900">
                    {report.projectId}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(report.generatedAt)}
                  </p>
                  <a 
                    href={report.downloadUrl}
                    className="text-xs hover:underline"
                    style={{ color: '#067A46' }}
                    download
                  >
                    Download Report
                  </a>
                </div>
              ))}
              <Link 
                href="/reports"
                className="text-sm font-medium hover:underline"
                style={{ color: '#067A46' }}
              >
                View all reports →
              </Link>
            </div>
          )}
        </div>

        {/* Status Card */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">System Status</h2>
          <div className="space-y-3">
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#067A46' }}></div>
              <span className="text-sm text-gray-600">Chat Agent Online</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#067A46' }}></div>
              <span className="text-sm text-gray-600">Report Generator Ready</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#B5E7BA' }}></div>
              <span className="text-sm text-gray-600">Analysis Engine Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

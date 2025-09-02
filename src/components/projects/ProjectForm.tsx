import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProjectCreationErrorState, categorizeError, ErrorDisplay } from './ErrorHandling';
import { OnboardingTooltip, IMMEDIATE_REPORTS_TOOLTIPS } from '../ui/OnboardingTooltip';

const PriorityEnum = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
} as const;

const projectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  priority: z.nativeEnum(PriorityEnum),
  competitors: z.array(z.string()).optional(),
  parameters: z.record(z.any()).optional(),
  tags: z.array(z.string()),
  endDate: z.string().optional(),
  // Enhanced fields for immediate report generation
  productName: z.string().optional(),
  productWebsite: z.string().url('Please enter a valid website URL').optional(),
  positioning: z.string().optional(),
  customerData: z.string().optional(),
  userProblem: z.string().optional(),
  industry: z.string().optional(),
  generateInitialReport: z.boolean(),
  reportTemplate: z.enum(['comprehensive', 'executive', 'technical', 'strategic']),
  requireFreshSnapshots: z.boolean(),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

interface ProjectFormProps {
  onSubmit: (data: ProjectFormData) => Promise<void>;
  initialData?: Partial<ProjectFormData>;
  competitors?: Array<{ id: string; name: string }>;
}

export default function ProjectForm({ onSubmit, initialData, competitors = [] }: ProjectFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<ProjectCreationErrorState | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      ...initialData,
      tags: initialData?.tags || [],
      priority: initialData?.priority || 'MEDIUM',
      generateInitialReport: initialData?.generateInitialReport ?? true,
      reportTemplate: initialData?.reportTemplate || 'comprehensive',
      requireFreshSnapshots: initialData?.requireFreshSnapshots ?? true
    }
  });

  const generateInitialReport = watch('generateInitialReport');

  const handleFormSubmit = async (data: ProjectFormData) => {
    try {
      setIsSubmitting(true);
      setError(null);
      setErrorState(null);
      await onSubmit(data);
      reset();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);

      // Categorize the error for enhanced handling
      const categorizedError = categorizeError(err, {
        phase: 'project_creation',
        projectId: undefined // No project ID yet since creation failed
      });

      // Add project creation specific fallback options
      categorizedError.fallbackOptions = [
        {
          label: 'Try Again',
          description: 'Retry creating the project with the same information',
          action: () => {
            setError(null);
            setErrorState(null);
            // The user can simply click submit again
          },
          primary: true
        },
        {
          label: 'Save as Draft',
          description: 'Save your project information and try creating it later',
          action: () => {
            // This would save the form data to localStorage or a draft API
            const draftData = JSON.stringify(data);
            localStorage.setItem('project_draft', draftData);
            setError(null);
            setErrorState(null);
            console.log('Project saved as draft');
          }
        },
        {
          label: 'Reset Form',
          description: 'Clear the form and start over',
          action: () => {
            reset();
            setError(null);
            setErrorState(null);
          }
        }
      ];

      setErrorState(categorizedError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    setError(null);
    setErrorState(null);
  };

  const handleContactSupport = () => {
    const supportUrl = new URL('/support', window.location.origin);
    supportUrl.searchParams.set('issue', 'project-creation-failed');
    if (errorState?.supportInfo?.correlationId) {
      supportUrl.searchParams.set('ref', errorState.supportInfo.correlationId);
    }
    window.open(supportUrl.toString(), '_blank');
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Enhanced Error Display */}
      {errorState && (
        <div className="space-y-4">
          <ErrorDisplay
            error={errorState}
            onRetry={handleRetry}
            onContactSupport={handleContactSupport}
            compact={false}
            showTechnicalDetails={false}
          />
        </div>
      )}

      {/* Fallback simple error display */}
      {error && !errorState && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Project Creation Failed
              </h3>
              <div className="mt-2 text-sm text-red-700">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Project Name *
        </label>
        <input
          type="text"
          id="name"
          {...register('name')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          {...register('description')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
          Priority
        </label>
        <select
          id="priority"
          {...register('priority')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          {Object.values(PriorityEnum).map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="competitors" className="block text-sm font-medium text-gray-700">
          Competitors
        </label>
        <select
          id="competitors"
          multiple
          {...register('competitors')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          {competitors.map((competitor) => (
            <option key={competitor.id} value={competitor.id}>
              {competitor.name}
            </option>
          ))}
        </select>
      </div>

      {/* Product Information Section */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Product Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="productName" className="block text-sm font-medium text-gray-700">
              Product Name
            </label>
            <input
              type="text"
              id="productName"
              {...register('productName')}
              placeholder="e.g., My SaaS Platform"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
            {errors.productName && (
              <p className="mt-1 text-sm text-red-500">{errors.productName.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="productWebsite" className="block text-sm font-medium text-gray-700">
              Product Website
            </label>
            <input
              type="url"
              id="productWebsite"
              {...register('productWebsite')}
              placeholder="https://myproduct.com"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
            {errors.productWebsite && (
              <p className="mt-1 text-sm text-red-500">{errors.productWebsite.message}</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="industry" className="block text-sm font-medium text-gray-700">
            Industry
          </label>
          <input
            type="text"
            id="industry"
            {...register('industry')}
            placeholder="e.g., SaaS, E-commerce, Healthcare"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="positioning" className="block text-sm font-medium text-gray-700">
            Product Positioning
          </label>
          <textarea
            id="positioning"
            rows={2}
            {...register('positioning')}
            placeholder="Brief description of how you position your product in the market"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="customerData" className="block text-sm font-medium text-gray-700">
            Target Customers
          </label>
          <textarea
            id="customerData"
            rows={2}
            {...register('customerData')}
            placeholder="Describe your target customer base and market segment"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="userProblem" className="block text-sm font-medium text-gray-700">
            Problem You Solve
          </label>
          <textarea
            id="userProblem"
            rows={2}
            {...register('userProblem')}
            placeholder="What core problem does your product solve for customers?"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Immediate Report Generation Section */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-medium text-gray-900">Immediate Report Generation</h3>
            <OnboardingTooltip
              id="immediate-reports-tooltip"
              content={IMMEDIATE_REPORTS_TOOLTIPS.projectCreation.immediateReports}
              trigger="hover"
            >
              <svg className="h-4 w-4 text-gray-400 hover:text-indigo-600 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </OnboardingTooltip>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="generateInitialReport"
              {...register('generateInitialReport')}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="generateInitialReport" className="ml-2 block text-sm text-gray-900">
              Generate report immediately
            </label>
          </div>
        </div>

        {generateInitialReport && (
          <div className="space-y-4 bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-700">
                <p className="font-medium">We'll capture fresh competitor data and generate your first competitive analysis report immediately after project creation.</p>
                <p className="mt-1">This typically takes 30-45 seconds and includes real-time progress updates.</p>
              </div>
            </div>

            <div>
              <label htmlFor="reportTemplate" className="block text-sm font-medium text-gray-700">
                Report Template
              </label>
              <select
                id="reportTemplate"
                {...register('reportTemplate')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="comprehensive">Comprehensive Analysis (Recommended)</option>
                <option value="executive">Executive Summary</option>
                <option value="technical">Technical Comparison</option>
                <option value="strategic">Strategic Insights</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="requireFreshSnapshots"
                {...register('requireFreshSnapshots')}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="requireFreshSnapshots" className="ml-2 block text-sm text-gray-700">
                Require fresh competitor snapshots (recommended for most accurate data)
              </label>
              <span className="ml-2 text-xs text-gray-500">
                <a href="/help/immediate-reports" target="_blank" className="text-indigo-600 hover:text-indigo-700 underline">
                  Learn more
                </a>
              </span>
            </div>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
          End Date
        </label>
        <input
          type="datetime-local"
          id="endDate"
          {...register('endDate')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center rounded-md border border-transparent bg-black py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </form>
  );
} 
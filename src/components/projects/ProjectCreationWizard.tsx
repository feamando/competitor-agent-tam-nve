'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useInitialReportStatus } from '@/hooks/useInitialReportStatus';
import InitialReportProgressIndicator from './InitialReportProgressIndicator';
import { ProjectCreationErrorState, categorizeError, ErrorDisplay } from './ErrorHandling';
import { OnboardingTooltip, IMMEDIATE_REPORTS_TOOLTIPS } from '../ui/OnboardingTooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoadingButton } from '@/components/composed/LoadingButton';

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

export type ProjectFormData = z.infer<typeof projectFormSchema>;

export interface ReportGenerationInfo {
  initialReportGenerated: boolean;
  reportId?: string;
  reportStatus?: string;
  error?: string;
  fallbackScheduled?: boolean;
  competitorSnapshotsCaptured?: boolean;
  dataFreshness?: string;
}

export interface ProjectCreationWizardProps {
  onProjectCreated?: (projectId: string, reportInfo?: ReportGenerationInfo) => void;
  onError?: (error: ProjectCreationErrorState) => void;
  initialData?: Partial<ProjectFormData>;
  competitors?: Array<{ id: string; name: string }>;
}

type WizardStep = 'basic' | 'product' | 'competitors' | 'configuration' | 'review' | 'progress' | 'success';

const STEP_TITLES = {
  basic: 'Project Basics',
  product: 'Product Information',
  competitors: 'Competitive Analysis',
  configuration: 'Report Configuration',
  review: 'Review & Confirm',
  progress: 'Generating Report',
  success: 'Project Created!'
};

const STEP_DESCRIPTIONS = {
  basic: 'Start with basic project information',
  product: 'Tell us about your product',
  competitors: 'Configure competitive analysis',
  configuration: 'Choose report template and options',
  review: 'Review your project before creation',
  progress: 'Your project is being created and analyzed',
  success: 'Your project and report are ready!'
};

export default function ProjectCreationWizard({
  onProjectCreated,
  onError,
  initialData,
  competitors = []
}: ProjectCreationWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [reportInfo, setReportInfo] = useState<ReportGenerationInfo | null>(null);
  const [errorState, setErrorState] = useState<ProjectCreationErrorState | null>(null);
  const [competitorUrls, setCompetitorUrls] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    watch,
    setValue,
    getValues,
    trigger
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    mode: 'onChange',
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
  const reportTemplate = watch('reportTemplate');

  // Initialize form values
  useEffect(() => {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        setValue(key as keyof ProjectFormData, value);
      });
      if (initialData.tags) {
        setTags(initialData.tags);
      }
    }
  }, [initialData, setValue]);

  // Update form tags when tags state changes
  useEffect(() => {
    setValue('tags', tags);
  }, [tags, setValue]);

  const getStepOrder = (): WizardStep[] => {
    const baseSteps: WizardStep[] = ['basic', 'product', 'competitors', 'configuration', 'review'];
    if (generateInitialReport) {
      return [...baseSteps, 'progress', 'success'];
    }
    return [...baseSteps, 'success'];
  };

  const getCurrentStepIndex = (): number => {
    return getStepOrder().indexOf(currentStep);
  };

  const getTotalSteps = (): number => {
    return getStepOrder().length;
  };

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 'basic':
        // Only check if name is filled for basic step
        return !!watch('name')?.trim();
      case 'product':
        if (generateInitialReport) {
          return !!(watch('productName')?.trim() && watch('productWebsite')?.trim());
        }
        return true;
      case 'competitors':
        return competitorUrls.filter(url => url.trim()).length > 0 || !generateInitialReport;
      case 'configuration':
        return !!reportTemplate;
      case 'review':
        return isValid;
      default:
        return true;
    }
  };

  const nextStep = async () => {
    const currentValid = await trigger();
    if (!currentValid) return;

    const steps = getStepOrder();
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps = getStepOrder();
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleFormSubmit = async (data: ProjectFormData) => {
    try {
      setIsSubmitting(true);
      setErrorState(null);

      // Prepare submission data
      const submissionData = {
        ...data,
        competitors: competitorUrls.filter(url => url.trim()),
        tags
      };

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create project');
      }

      const result = await response.json();
      setProjectId(result.project.id);

      // Check if initial report generation was attempted
      if (data.generateInitialReport && result.reportGenerationInfo) {
        setReportInfo(result.reportGenerationInfo);
        setCurrentStep('progress');
      } else {
        setCurrentStep('success');
        onProjectCreated?.(result.project.id);
      }
    } catch (err) {
      const categorizedError = categorizeError(err, {
        phase: 'project_creation',
        projectId: undefined
      });

      // Add project creation specific fallback options
      categorizedError.fallbackOptions = [
        {
          label: 'Try Again',
          description: 'Retry creating the project with the same information',
          action: () => {
            setErrorState(null);
            setIsSubmitting(false);
          },
          primary: true
        },
        {
          label: 'Save as Draft',
          description: 'Save your project information and try creating it later',
          action: () => {
            const draftData = JSON.stringify(data);
            localStorage.setItem('project_draft', draftData);
            setErrorState(null);
            console.log('Project saved as draft');
          }
        },
        {
          label: 'Go Back',
          description: 'Return to review your project information',
          action: () => {
            setErrorState(null);
            setCurrentStep('review');
            setIsSubmitting(false);
          }
        }
      ];

      setErrorState(categorizedError);
      onError?.(categorizedError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportComplete = (reportId: string) => {
    setReportInfo(prev => prev ? { ...prev, reportId, reportStatus: 'completed' } : null);
    setCurrentStep('success');
    onProjectCreated?.(projectId!, reportInfo!);
  };

  const handleReportError = (error: string) => {
    setReportInfo(prev => prev ? { ...prev, error, reportStatus: 'failed' } : null);
    // Stay on progress step to show error handling options
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addCompetitorUrl = () => {
    setCompetitorUrls([...competitorUrls, '']);
  };

  const updateCompetitorUrl = (index: number, value: string) => {
    const newUrls = [...competitorUrls];
    newUrls[index] = value;
    setCompetitorUrls(newUrls);
  };

  const removeCompetitorUrl = (index: number) => {
    if (competitorUrls.length > 1) {
      setCompetitorUrls(competitorUrls.filter((_, i) => i !== index));
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                type="text"
                id="name"
                data-testid="project-name"
                {...register('name')}
                placeholder="Enter a descriptive name for your project"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                {...register('description')}
                placeholder="Briefly describe the goals and scope of this competitive analysis"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={watch('priority')}
                onValueChange={(value) => setValue('priority', value as typeof PriorityEnum[keyof typeof PriorityEnum])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="cursor-pointer"
                  >
                    {tag}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTag(tag)}
                      className="ml-1 h-4 w-4 p-0 hover:bg-destructive/20"
                    >
                      <span className="text-xs">×</span>
                    </Button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Add a tag"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addTag}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        );

      case 'product':
        return (
          <div className="space-y-6">
            <Alert>
              <OnboardingTooltip tooltipKey="productInfo" placement="right">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </OnboardingTooltip>
              <AlertDescription>
                Product information helps generate more accurate competitive insights and positioning analysis.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="productName">
                Product Name {generateInitialReport && '*'}
              </Label>
              <Input
                type="text"
                id="productName"
                data-testid="product-name"
                {...register('productName')}
                placeholder="Enter your product name"
              />
              {errors.productName && (
                <p className="text-sm text-destructive">{errors.productName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="productWebsite">
                Product Website {generateInitialReport && '*'}
              </Label>
              <Input
                type="url"
                id="productWebsite"
                data-testid="product-website"
                {...register('productWebsite')}
                placeholder="https://your-product.com"
              />
              {errors.productWebsite && (
                <p className="text-sm text-destructive">{errors.productWebsite.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                type="text"
                id="industry"
                {...register('industry')}
                placeholder="e.g., SaaS, E-commerce, FinTech"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="positioning">Product Positioning</Label>
              <Textarea
                id="positioning"
                rows={3}
                {...register('positioning')}
                placeholder="How do you position your product in the market? What makes it unique?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="userProblem">Problem You're Solving</Label>
              <Textarea
                id="userProblem"
                rows={3}
                {...register('userProblem')}
                placeholder="What problem does your product solve for customers?"
              />
            </div>
          </div>
        );

      case 'competitors':
        return (
          <div className="space-y-6">
            <Alert variant="default" className="border-amber-200 bg-amber-50">
              <svg className="h-4 w-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <AlertDescription className="text-amber-700">
                Add competitor websites for analysis. Fresh snapshots will be captured for the most accurate comparison.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <Label className="text-base font-medium">Competitors</Label>
              {competitorUrls.map((url, index) => (
                <Card key={index}>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`competitor-name-${index}`} className="text-sm">
                        Competitor Name
                      </Label>
                      <Input
                        type="text"
                        id={`competitor-name-${index}`}
                        placeholder={`Competitor ${index + 1}`}
                        data-testid={`competitor-name-${index}`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor={`competitor-website-${index}`} className="text-sm">
                          Website
                        </Label>
                        <Input
                          type="url"
                          id={`competitor-website-${index}`}
                          value={url}
                          onChange={(e) => updateCompetitorUrl(index, e.target.value)}
                          placeholder="https://competitor.com"
                          data-testid={`competitor-website-${index}`}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeCompetitorUrl(index)}
                          disabled={competitorUrls.length === 1}
                          className="mb-0"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addCompetitorUrl}
                className="w-full"
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Another Competitor
              </Button>
            </div>
          </div>
        );

      case 'configuration':
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center">
                <input
                  id="generateInitialReport"
                  type="checkbox"
                  {...register('generateInitialReport')}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="generateInitialReport" className="ml-2 block text-sm text-gray-900">
                  Generate immediate competitive report
                </label>
                <OnboardingTooltip tooltipKey="immediateReports" placement="right">
                  <svg className="h-4 w-4 text-gray-400 ml-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </OnboardingTooltip>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Create a comprehensive competitive analysis report immediately after project creation
              </p>
            </div>

            {generateInitialReport && (
              <>
                <div>
                  <label htmlFor="reportTemplate" className="block text-sm font-medium text-gray-700">
                    Report Template
                  </label>
                  <select
                    id="reportTemplate"
                    {...register('reportTemplate')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="comprehensive">Comprehensive Analysis (Detailed)</option>
                    <option value="executive">Executive Summary (High-level)</option>
                    <option value="technical">Technical Comparison (Feature-focused)</option>
                    <option value="strategic">Strategic Positioning (Market-focused)</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Choose the type of analysis that best fits your needs
                  </p>
                </div>

                <div>
                  <div className="flex items-center">
                    <input
                      id="requireFreshSnapshots"
                      type="checkbox"
                      {...register('requireFreshSnapshots')}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="requireFreshSnapshots" className="ml-2 block text-sm text-gray-900">
                      Require fresh competitor snapshots
                    </label>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Capture new screenshots and content from competitor websites (recommended for accuracy)
                  </p>
                </div>
              </>
            )}
          </div>
        );

      case 'review':
        const formData = getValues();
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Project Summary</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Project Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formData.name}</dd>
                </div>
                
                {formData.description && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Description</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formData.description}</dd>
                  </div>
                )}
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Priority</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formData.priority}</dd>
                </div>
                
                {formData.productName && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Product</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formData.productName}</dd>
                  </div>
                )}
                
                {formData.industry && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Industry</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formData.industry}</dd>
                  </div>
                )}
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Competitors</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {competitorUrls.filter(url => url.trim()).length} competitors
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Immediate Report</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formData.generateInitialReport ? `Yes (${formData.reportTemplate})` : 'No'}
                  </dd>
                </div>
                
                {tags.length > 0 && (
                  <div className="md:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Tags</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {tags.map((tag, index) => (
                        <span key={index} className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-100 text-indigo-800 text-xs font-medium">
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </div>
            </div>
            
            {errorState && (
              <ErrorDisplay
                error={errorState}
                onRetry={() => setErrorState(null)}
                compact={false}
                showTechnicalDetails={false}
              />
            )}
          </div>
        );

      case 'progress':
        if (!projectId) return null;
        
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">Creating Your Project</h3>
              <p className="mt-1 text-sm text-gray-500">
                Your project is being created and the initial competitive report is being generated
              </p>
            </div>
            
            <InitialReportProgressIndicator
              projectId={projectId}
              onComplete={handleReportComplete}
              onError={handleReportError}
              compact={false}
              showEstimatedTime={true}
            />
          </div>
        );

      case 'success':
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900">Project Created Successfully!</h3>
              <p className="mt-1 text-sm text-gray-500">
                {reportInfo?.reportId 
                  ? 'Your project and competitive report are ready to view'
                  : 'Your project has been created and is ready for analysis'
                }
              </p>
            </div>
            
            {reportInfo?.reportId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-green-700">
                    Your competitive analysis report has been generated and is ready to view.
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-center space-x-4">
              {reportInfo?.reportId && (
                <button
                  onClick={() => onProjectCreated?.(projectId!, reportInfo)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  View Report
                </button>
              )}
              
              <button
                onClick={() => window.location.href = `/projects/${projectId}`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                View Project
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">{STEP_TITLES[currentStep]}</h2>
          <span className="text-sm text-gray-500">
            Step {getCurrentStepIndex() + 1} of {getTotalSteps()}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">{STEP_DESCRIPTIONS[currentStep]}</p>
        
        <div className="mt-4">
          <Progress 
            value={((getCurrentStepIndex() + 1) / getTotalSteps()) * 100} 
            className="h-2"
          />
        </div>
      </div>

      {/* Step content */}
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <Card className="mb-6">
          <CardContent className="p-6">
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation buttons */}
        {!['progress', 'success'].includes(currentStep) && (
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={getCurrentStepIndex() === 0}
            >
              Previous
            </Button>

            {currentStep === 'review' ? (
              <LoadingButton
                type="submit"
                data-testid="create-project"
                loading={isSubmitting}
                disabled={!canGoNext()}
              >
                Create Project
              </LoadingButton>
            ) : (
              <Button
                type="button"
                data-testid="next-button"
                onClick={nextStep}
                disabled={!canGoNext()}
              >
                Next
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
} 
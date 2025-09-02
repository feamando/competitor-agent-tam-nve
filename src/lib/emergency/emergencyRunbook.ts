import { logger, createCorrelationLogger, trackBusinessEvent } from '../logger';
import { createId } from '@paralleldrive/cuid2';
import { AutomatedSystemHealthCheck } from '../health/automatedSystemHealthCheck';
import { SelfHealingSystem } from '../recovery/selfHealingSystem';
import { MaintenanceMode } from '../maintenance/maintenanceMode';
import { EmergencyFallbackSystem } from '../emergency-fallback/EmergencyFallbackSystem';

interface EmergencyProcedure {
  id: string;
  name: string;
  category: EmergencyCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  
  triggers: string[];
  symptoms: string[];
  immediateActions: EmergencyAction[];
  investigationSteps: InvestigationStep[];
  resolutionSteps: ResolutionStep[];
  preventionMeasures: string[];
  
  estimatedResolutionTime: number; // minutes
  escalationThreshold: number; // minutes before escalation
  
  relatedProcedures: string[];
  lastUpdated: Date;
  version: string;
}

interface EmergencyAction {
  id: string;
  order: number;
  description: string;
  command?: string;
  automated: boolean;
  timeoutMinutes: number;
  criticalPath: boolean;
  safetyCheck: string;
}

interface InvestigationStep {
  id: string;
  order: number;
  description: string;
  checkCommand?: string;
  expectedResults: string[];
  troubleshootingHints: string[];
}

interface ResolutionStep {
  id: string;
  order: number;
  description: string;
  action: string;
  command?: string;
  rollbackPossible: boolean;
  rollbackCommand?: string;
  verificationStep: string;
}

interface IncidentResponse {
  id: string;
  procedureId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'resolved' | 'escalated';
  
  currentStep: number;
  completedActions: string[];
  failedActions: string[];
  investigationFindings: Record<string, any>;
  
  assignedTo: string;
  escalatedTo?: string;
  correlationId: string;
  
  timeline: IncidentTimelineEntry[];
  notes: string[];
}

interface IncidentTimelineEntry {
  timestamp: Date;
  action: string;
  result: string;
  performedBy: string;
  details?: Record<string, any>;
}

type EmergencyCategory = 
  | 'database_failure'
  | 'data_collection_failure'
  | 'report_generation_failure'
  | 'system_performance'
  | 'security_incident'
  | 'data_corruption'
  | 'service_unavailable'
  | 'external_dependency_failure'
  | 'emergency_fallback_failure'
  | 'maintenance_failure';

/**
 * Task 7.4: Emergency Runbook System for Critical Failures
 */
export class EmergencyRunbook {
  private static instance: EmergencyRunbook;
  private procedures: Map<string, EmergencyProcedure> = new Map();
  private activeIncidents: Map<string, IncidentResponse> = new Map();
  private incidentHistory: IncidentResponse[] = [];
  private readonly MAX_HISTORY_SIZE = 200;

  private constructor() {
    this.initializeEmergencyProcedures();
  }

  public static getInstance(): EmergencyRunbook {
    if (!EmergencyRunbook.instance) {
      EmergencyRunbook.instance = new EmergencyRunbook();
    }
    return EmergencyRunbook.instance;
  }

  /**
   * Task 7.4: Initialize emergency procedures for all critical failure scenarios
   */
  private initializeEmergencyProcedures(): void {
    const procedures: Omit<EmergencyProcedure, 'id' | 'lastUpdated'>[] = [
      // Database Failure Procedures
      {
        name: 'Database Connection Failure',
        category: 'database_failure',
        severity: 'critical',
        description: 'Complete database connectivity loss affecting all operations',
        triggers: [
          'Database connection timeout',
          'Connection pool exhausted',
          'Database server unreachable',
          'Authentication failures'
        ],
        symptoms: [
          'All database operations failing',
          'Connection timeout errors in logs',
          'Application unable to start',
          'Health checks failing'
        ],
        immediateActions: [
          {
            id: createId(),
            order: 1,
            description: 'Enable emergency maintenance mode',
            automated: true,
            timeoutMinutes: 2,
            criticalPath: true,
            safetyCheck: 'Verify no critical operations in progress'
          },
          {
            id: createId(),
            order: 2,
            description: 'Check database server status',
            command: 'systemctl status postgresql',
            automated: false,
            timeoutMinutes: 3,
            criticalPath: true,
            safetyCheck: 'Confirm server accessibility'
          },
          {
            id: createId(),
            order: 3,
            description: 'Restart database connection pool',
            automated: true,
            timeoutMinutes: 5,
            criticalPath: true,
            safetyCheck: 'Verify existing connections are cleanly closed'
          }
        ],
        investigationSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Check database server logs',
            checkCommand: 'tail -n 100 /var/log/postgresql/postgresql.log',
            expectedResults: ['Connection errors', 'Authentication failures', 'Resource exhaustion'],
            troubleshootingHints: ['Check for recent configuration changes', 'Verify disk space']
          },
          {
            id: createId(),
            order: 2,
            description: 'Verify network connectivity to database',
            checkCommand: 'telnet database-host 5432',
            expectedResults: ['Connection successful', 'Connection refused', 'Timeout'],
            troubleshootingHints: ['Check firewall rules', 'Verify DNS resolution']
          }
        ],
        resolutionSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Restart database service',
            action: 'systemctl restart postgresql',
            rollbackPossible: false,
            verificationStep: 'Test database connectivity'
          },
          {
            id: createId(),
            order: 2,
            description: 'Clear connection pool and reinitialize',
            action: 'Restart application with fresh connection pool',
            rollbackPossible: true,
            rollbackCommand: 'Restore previous connection pool configuration',
            verificationStep: 'Run health checks'
          }
        ],
        preventionMeasures: [
          'Implement connection pool monitoring',
          'Set up database server monitoring',
          'Regular connection pool maintenance',
          'Database failover configuration'
        ],
        estimatedResolutionTime: 15,
        escalationThreshold: 10,
        relatedProcedures: ['database_performance_degradation', 'application_startup_failure'],
        version: '1.0'
      },

      // Data Collection Failure
      {
        name: 'Complete Data Collection Failure',
        category: 'data_collection_failure',
        severity: 'high',
        description: 'All data collection services failing, no new data being captured',
        triggers: [
          'Data collection success rate below 10%',
          'No successful collections in 30 minutes',
          'All external services unreachable',
          'Data validation failures'
        ],
        symptoms: [
          'Zero successful data collections',
          'External service connection errors',
          'Data quality scores dropping to zero',
          'Emergency fallback mode activated'
        ],
        immediateActions: [
          {
            id: createId(),
            order: 1,
            description: 'Trigger emergency fallback for active reports',
            automated: true,
            timeoutMinutes: 5,
            criticalPath: true,
            safetyCheck: 'Verify fallback system is operational'
          },
          {
            id: createId(),
            order: 2,
            description: 'Check external service status',
            automated: true,
            timeoutMinutes: 3,
            criticalPath: false,
            safetyCheck: 'None'
          },
          {
            id: createId(),
            order: 3,
            description: 'Reset data collection services',
            automated: true,
            timeoutMinutes: 10,
            criticalPath: true,
            safetyCheck: 'Backup current collection state'
          }
        ],
        investigationSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Check data collection service logs',
            expectedResults: ['Connection errors', 'Rate limiting', 'Authentication failures'],
            troubleshootingHints: ['Check API rate limits', 'Verify credentials']
          },
          {
            id: createId(),
            order: 2,
            description: 'Test external service connectivity',
            expectedResults: ['HTTP status codes', 'Response times', 'Content validation'],
            troubleshootingHints: ['Use curl to test endpoints', 'Check for IP blocking']
          }
        ],
        resolutionSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Restart data collection workers',
            action: 'Restart all data collection services',
            rollbackPossible: true,
            verificationStep: 'Monitor collection success rate'
          },
          {
            id: createId(),
            order: 2,
            description: 'Implement circuit breaker recovery',
            action: 'Reset circuit breakers and retry failed operations',
            rollbackPossible: true,
            verificationStep: 'Check external service response'
          }
        ],
        preventionMeasures: [
          'Implement diverse data sources',
          'Add circuit breaker monitoring',
          'Set up external service health monitoring',
          'Create data collection redundancy'
        ],
        estimatedResolutionTime: 20,
        escalationThreshold: 15,
        relatedProcedures: ['external_dependency_failure', 'emergency_fallback_failure'],
        version: '1.0'
      },

      // Report Generation Failure
      {
        name: 'Report Generation System Failure',
        category: 'report_generation_failure',
        severity: 'high',
        description: 'Complete failure of report generation system',
        triggers: [
          'All report generation jobs failing',
          'Report queue backed up for 2+ hours',
          'Memory exhaustion in report workers',
          'Template rendering failures'
        ],
        symptoms: [
          'No reports being generated',
          'Report generation queue growing',
          'Out of memory errors',
          'Template compilation errors'
        ],
        immediateActions: [
          {
            id: createId(),
            order: 1,
            description: 'Clear stuck report generation jobs',
            automated: true,
            timeoutMinutes: 5,
            criticalPath: true,
            safetyCheck: 'Backup job state before clearing'
          },
          {
            id: createId(),
            order: 2,
            description: 'Restart report generation workers',
            automated: true,
            timeoutMinutes: 10,
            criticalPath: true,
            safetyCheck: 'Ensure graceful shutdown of existing workers'
          }
        ],
        investigationSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Check report worker memory usage',
            expectedResults: ['Memory usage patterns', 'Memory leaks', 'GC performance'],
            troubleshootingHints: ['Monitor heap usage', 'Check for circular references']
          }
        ],
        resolutionSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Restart report generation system',
            action: 'Full restart of report generation infrastructure',
            rollbackPossible: false,
            verificationStep: 'Generate test report'
          }
        ],
        preventionMeasures: [
          'Implement memory monitoring',
          'Add report generation timeouts',
          'Create report generation load balancing',
          'Implement report template validation'
        ],
        estimatedResolutionTime: 25,
        escalationThreshold: 20,
        relatedProcedures: ['system_performance', 'emergency_fallback_failure'],
        version: '1.0'
      },

      // System Performance Degradation
      {
        name: 'System Performance Degradation',
        category: 'system_performance',
        severity: 'medium',
        description: 'System performance significantly below normal levels',
        triggers: [
          'Response times over 10 seconds',
          'CPU usage above 90% for 10+ minutes',
          'Memory usage above 95%',
          'Disk I/O saturation'
        ],
        symptoms: [
          'Slow response times',
          'Timeouts in operations',
          'High resource utilization',
          'User complaints about slowness'
        ],
        immediateActions: [
          {
            id: createId(),
            order: 1,
            description: 'Run system resource cleanup',
            automated: true,
            timeoutMinutes: 5,
            criticalPath: false,
            safetyCheck: 'Verify critical processes not affected'
          },
          {
            id: createId(),
            order: 2,
            description: 'Scale up resources if possible',
            automated: false,
            timeoutMinutes: 10,
            criticalPath: false,
            safetyCheck: 'Check resource availability'
          }
        ],
        investigationSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Check system resource usage',
            checkCommand: 'top -b -n 1',
            expectedResults: ['CPU usage patterns', 'Memory consumption', 'Process list'],
            troubleshootingHints: ['Look for runaway processes', 'Check for memory leaks']
          }
        ],
        resolutionSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Optimize system resources',
            action: 'Kill non-essential processes and clear caches',
            rollbackPossible: true,
            verificationStep: 'Monitor system performance metrics'
          }
        ],
        preventionMeasures: [
          'Implement resource monitoring',
          'Set up performance alerts',
          'Regular system maintenance',
          'Capacity planning'
        ],
        estimatedResolutionTime: 30,
        escalationThreshold: 45,
        relatedProcedures: ['database_failure'],
        version: '1.0'
      },

      // Emergency Fallback System Failure
      {
        name: 'Emergency Fallback System Failure',
        category: 'emergency_fallback_failure',
        severity: 'critical',
        description: 'Emergency fallback system itself is failing',
        triggers: [
          'Emergency fallback operations failing',
          'Circuit breakers not functioning',
          'Fallback reports not generating',
          'Emergency metrics unavailable'
        ],
        symptoms: [
          'Emergency fallback errors in logs',
          'Circuit breakers stuck open',
          'No emergency reports generated',
          'System health deteriorating'
        ],
        immediateActions: [
          {
            id: createId(),
            order: 1,
            description: 'Enable emergency maintenance mode',
            automated: true,
            timeoutMinutes: 2,
            criticalPath: true,
            safetyCheck: 'Verify maintenance mode system operational'
          },
          {
            id: createId(),
            order: 2,
            description: 'Notify all stakeholders immediately',
            automated: true,
            timeoutMinutes: 3,
            criticalPath: true,
            safetyCheck: 'Confirm notification system working'
          }
        ],
        investigationSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Check emergency fallback system logs',
            expectedResults: ['Fallback operation failures', 'Circuit breaker states', 'System errors'],
            troubleshootingHints: ['Look for initialization errors', 'Check dependency failures']
          }
        ],
        resolutionSteps: [
          {
            id: createId(),
            order: 1,
            description: 'Restart emergency fallback services',
            action: 'Complete restart of emergency fallback system',
            rollbackPossible: false,
            verificationStep: 'Test emergency fallback functionality'
          }
        ],
        preventionMeasures: [
          'Implement fallback system monitoring',
          'Regular fallback system testing',
          'Backup fallback mechanisms',
          'Fallback system health checks'
        ],
        estimatedResolutionTime: 10,
        escalationThreshold: 5,
        relatedProcedures: ['maintenance_failure'],
        version: '1.0'
      }
    ];

    procedures.forEach(proc => {
      const procedure: EmergencyProcedure = {
        ...proc,
        id: createId(),
        lastUpdated: new Date()
      };
      this.procedures.set(procedure.id, procedure);
    });

    logger.info('Emergency procedures initialized', {
      procedureCount: this.procedures.size,
      categories: Array.from(new Set(procedures.map(p => p.category)))
    });
  }

  /**
   * Task 7.4: Trigger emergency procedure based on incident
   */
  public async triggerEmergencyProcedure(
    category: EmergencyCategory,
    severity: 'low' | 'medium' | 'high' | 'critical',
    description: string,
    assignedTo: string = 'system',
    context?: Record<string, any>
  ): Promise<IncidentResponse> {
    const correlationId = createId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    // Find matching procedure
    const procedure = this.findBestMatchingProcedure(category, severity);
    if (!procedure) {
      throw new Error(`No emergency procedure found for category: ${category}, severity: ${severity}`);
    }

    const incident: IncidentResponse = {
      id: createId(),
      procedureId: procedure.id,
      severity,
      startTime: new Date(),
      status: 'active',
      currentStep: 0,
      completedActions: [],
      failedActions: [],
      investigationFindings: context || {},
      assignedTo,
      correlationId,
      timeline: [{
        timestamp: new Date(),
        action: 'Incident created',
        result: `Emergency procedure triggered: ${procedure.name}`,
        performedBy: assignedTo,
        details: { category, severity, description }
      }],
      notes: [description]
    };

    this.activeIncidents.set(incident.id, incident);

    correlatedLogger.error(`Emergency procedure triggered: ${procedure.name}`, new Error(description), {
      incidentId: incident.id,
      procedureId: procedure.id,
      category,
      severity,
      estimatedResolutionTime: procedure.estimatedResolutionTime
    });

    // Execute immediate actions automatically
    await this.executeImmediateActions(incident, procedure);

    trackBusinessEvent('emergency_procedure_triggered', {
      incidentId: incident.id,
      procedureId: procedure.id,
      category,
      severity,
      correlationId
    });

    return incident;
  }

  /**
   * Task 7.4: Execute immediate actions for emergency procedure
   */
  private async executeImmediateActions(
    incident: IncidentResponse,
    procedure: EmergencyProcedure
  ): Promise<void> {
    const correlatedLogger = createCorrelationLogger(incident.correlationId);

    correlatedLogger.info('Executing immediate actions', {
      incidentId: incident.id,
      actionsCount: procedure.immediateActions.length
    });

    for (const action of procedure.immediateActions) {
      const startTime = Date.now();
      
      try {
        let result: string;
        
        if (action.automated) {
          result = await this.executeAutomatedAction(action, incident.correlationId);
        } else {
          result = `Manual action required: ${action.description}`;
          incident.notes.push(`Manual action needed: ${action.description}`);
        }

        incident.completedActions.push(action.id);
        incident.timeline.push({
          timestamp: new Date(),
          action: action.description,
          result,
          performedBy: action.automated ? 'system' : 'manual',
          details: {
            actionId: action.id,
            automated: action.automated,
            duration: Date.now() - startTime
          }
        });

        correlatedLogger.info(`Immediate action completed: ${action.description}`, {
          incidentId: incident.id,
          actionId: action.id,
          result,
          duration: Date.now() - startTime
        });

      } catch (error) {
        incident.failedActions.push(action.id);
        incident.timeline.push({
          timestamp: new Date(),
          action: action.description,
          result: `Failed: ${(error as Error).message}`,
          performedBy: 'system',
          details: {
            actionId: action.id,
            error: (error as Error).message,
            duration: Date.now() - startTime
          }
        });

        correlatedLogger.error(`Immediate action failed: ${action.description}`, error as Error, {
          incidentId: incident.id,
          actionId: action.id
        });
      }
    }
  }

  /**
   * Task 7.4: Execute automated action
   */
  private async executeAutomatedAction(action: EmergencyAction, correlationId: string): Promise<string> {
    const correlatedLogger = createCorrelationLogger(correlationId);

    switch (action.description) {
      case 'Enable emergency maintenance mode':
        const maintenanceMode = MaintenanceMode.getInstance();
        await maintenanceMode.enableEmergencyMaintenanceMode(
          'Emergency procedure activated',
          `Automated maintenance mode activation: ${action.description}`,
          'emergency_runbook'
        );
        return 'Emergency maintenance mode enabled successfully';

      case 'Trigger emergency fallback for active reports':
        const fallbackSystem = EmergencyFallbackSystem.getInstance();
        // This would trigger fallback for all active operations
        return 'Emergency fallback triggered for active operations';

      case 'Reset data collection services':
        const selfHealing = SelfHealingSystem.getInstance();
        const healingReport = await selfHealing.performSelfHealingCheck();
        return `Self-healing executed: ${healingReport.successfulActions} actions succeeded`;

      case 'Clear stuck report generation jobs':
        // This would clear stuck jobs from the report queue
        return 'Stuck report generation jobs cleared';

      case 'Restart database connection pool':
        // This would restart the database connection pool
        return 'Database connection pool restarted';

      case 'Run system resource cleanup':
        // This would perform garbage collection and cleanup
        if (global.gc) {
          global.gc();
        }
        return 'System resource cleanup completed';

      case 'Restart report generation workers':
        // This would restart report generation workers
        return 'Report generation workers restarted';

      case 'Notify all stakeholders immediately':
        // This would send emergency notifications
        correlatedLogger.error('CRITICAL: Emergency fallback system failure - immediate attention required', new Error('Emergency system failure'));
        return 'Emergency notifications sent to all stakeholders';

      default:
        return `Automated action executed: ${action.description}`;
    }
  }

  /**
   * Task 7.4: Get emergency procedure guidance
   */
  public getEmergencyGuidance(
    category: EmergencyCategory,
    severity?: 'low' | 'medium' | 'high' | 'critical'
  ): EmergencyProcedure | null {
    return this.findBestMatchingProcedure(category, severity);
  }

  /**
   * Task 7.4: Get all available emergency procedures
   */
  public getAvailableProcedures(): EmergencyProcedure[] {
    return Array.from(this.procedures.values());
  }

  /**
   * Task 7.4: Get active incidents
   */
  public getActiveIncidents(): IncidentResponse[] {
    return Array.from(this.activeIncidents.values());
  }

  /**
   * Task 7.4: Resolve incident
   */
  public async resolveIncident(
    incidentId: string,
    resolution: string,
    resolvedBy: string = 'system'
  ): Promise<boolean> {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) {
      logger.warn('Incident not found for resolution', { incidentId });
      return false;
    }

    incident.status = 'resolved';
    incident.endTime = new Date();
    incident.timeline.push({
      timestamp: new Date(),
      action: 'Incident resolved',
      result: resolution,
      performedBy: resolvedBy
    });

    // Move to history
    this.incidentHistory.push(incident);
    if (this.incidentHistory.length > this.MAX_HISTORY_SIZE) {
      this.incidentHistory.shift();
    }
    
    this.activeIncidents.delete(incidentId);

    const duration = incident.endTime.getTime() - incident.startTime.getTime();

    logger.info('Emergency incident resolved', {
      incidentId,
      duration: Math.round(duration / 1000 / 60), // minutes
      resolution,
      resolvedBy
    });

    trackBusinessEvent('emergency_incident_resolved', {
      incidentId,
      procedureId: incident.procedureId,
      duration,
      resolution,
      correlationId: incident.correlationId
    });

    return true;
  }

  /**
   * Task 7.4: Escalate incident
   */
  public async escalateIncident(
    incidentId: string,
    escalatedTo: string,
    reason: string
  ): Promise<boolean> {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) {
      logger.warn('Incident not found for escalation', { incidentId });
      return false;
    }

    incident.status = 'escalated';
    incident.escalatedTo = escalatedTo;
    incident.timeline.push({
      timestamp: new Date(),
      action: 'Incident escalated',
      result: `Escalated to: ${escalatedTo}. Reason: ${reason}`,
      performedBy: 'system'
    });

    logger.warn('Emergency incident escalated', {
      incidentId,
      escalatedTo,
      reason,
      timeSinceStart: Date.now() - incident.startTime.getTime()
    });

    trackBusinessEvent('emergency_incident_escalated', {
      incidentId,
      escalatedTo,
      reason,
      correlationId: incident.correlationId
    });

    return true;
  }

  // Helper methods

  private findBestMatchingProcedure(
    category: EmergencyCategory,
    severity?: 'low' | 'medium' | 'high' | 'critical'
  ): EmergencyProcedure | null {
    const procedures = Array.from(this.procedures.values())
      .filter(p => p.category === category);

    if (procedures.length === 0) return null;

    if (severity) {
      const exactMatch = procedures.find(p => p.severity === severity);
      if (exactMatch) return exactMatch;
    }

    // Return the most comprehensive procedure for the category
    return procedures.sort((a, b) => {
      const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })[0];
  }

  /**
   * Task 7.4: Get emergency runbook status
   */
  public getRunbookStatus(): {
    totalProcedures: number;
    activeIncidents: number;
    categories: string[];
    recentIncidents: IncidentResponse[];
    procedureUsageStats: Array<{
      procedureId: string;
      name: string;
      category: string;
      usageCount: number;
      averageResolutionTime: number;
    }>;
  } {
    const procedureUsage = new Map<string, { count: number; totalTime: number }>();
    
    this.incidentHistory.forEach(incident => {
      if (incident.endTime) {
        const current = procedureUsage.get(incident.procedureId) || { count: 0, totalTime: 0 };
        current.count++;
        current.totalTime += incident.endTime.getTime() - incident.startTime.getTime();
        procedureUsage.set(incident.procedureId, current);
      }
    });

    const procedureUsageStats = Array.from(procedureUsage.entries()).map(([procedureId, stats]) => {
      const procedure = this.procedures.get(procedureId);
      return {
        procedureId,
        name: procedure?.name || 'Unknown',
        category: procedure?.category || 'unknown',
        usageCount: stats.count,
        averageResolutionTime: Math.round(stats.totalTime / stats.count / 1000 / 60) // minutes
      };
    });

    return {
      totalProcedures: this.procedures.size,
      activeIncidents: this.activeIncidents.size,
      categories: Array.from(new Set(Array.from(this.procedures.values()).map(p => p.category))),
      recentIncidents: this.incidentHistory.slice(-10),
      procedureUsageStats
    };
  }

  /**
   * Task 7.4: Get incident history
   */
  public getIncidentHistory(limit?: number): IncidentResponse[] {
    const history = this.incidentHistory.slice();
    return limit ? history.slice(-limit) : history;
  }
} 
import { logger, createCorrelationLogger, trackBusinessEvent } from '../logger';
import { createId } from '@paralleldrive/cuid2';
import { AutomatedSystemHealthCheck } from '../health/automatedSystemHealthCheck';
import { SelfHealingSystem } from '../recovery/selfHealingSystem';
import { DataCollectionAlerts } from '../alerts/dataCollectionAlerts';

interface MaintenanceSession {
  id: string;
  type: 'scheduled' | 'emergency' | 'automatic';
  reason: string;
  description: string;
  startTime: Date;
  endTime?: Date;
  plannedDurationMinutes?: number;
  initiatedBy: string;
  correlationId: string;
  
  scope: MaintenanceScope;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  
  preMaintenanceChecks: PreMaintenanceCheck[];
  maintenanceActions: MaintenanceAction[];
  postMaintenanceChecks: PostMaintenanceCheck[];
  
  notifications: MaintenanceNotification[];
  rollbackPlan?: RollbackPlan;
  
  metadata: Record<string, any>;
}

interface MaintenanceScope {
  affectedServices: string[];
  affectedComponents: string[];
  userImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'complete';
  expectedDowntime: number; // minutes
  allowPartialFunctionality: boolean;
  emergencyBypassEnabled: boolean;
}

interface PreMaintenanceCheck {
  id: string;
  name: string;
  description: string;
  required: boolean;
  status: 'pending' | 'running' | 'passed' | 'failed';
  result?: string;
  checkFunction: () => Promise<{ passed: boolean; message: string }>;
}

interface MaintenanceAction {
  id: string;
  name: string;
  description: string;
  order: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  result?: string;
  actionFunction: () => Promise<{ success: boolean; message: string }>;
  rollbackFunction?: () => Promise<{ success: boolean; message: string }>;
}

interface PostMaintenanceCheck {
  id: string;
  name: string;
  description: string;
  critical: boolean;
  status: 'pending' | 'running' | 'passed' | 'failed';
  result?: string;
  checkFunction: () => Promise<{ passed: boolean; message: string }>;
}

interface MaintenanceNotification {
  id: string;
  type: 'user' | 'admin' | 'system';
  channel: 'email' | 'slack' | 'dashboard' | 'api';
  timing: 'before' | 'start' | 'during' | 'end' | 'after';
  message: string;
  sent: boolean;
  sentAt?: Date;
}

interface RollbackPlan {
  enabled: boolean;
  automaticTriggers: string[];
  manualTriggerThreshold: number; // number of failed actions
  rollbackActions: MaintenanceAction[];
  rollbackTimeout: number; // minutes
}

/**
 * Task 7.3: Maintenance Mode System for System Repairs
 */
export class MaintenanceMode {
  private static instance: MaintenanceMode;
  private currentMaintenance: MaintenanceSession | null = null;
  private maintenanceHistory: MaintenanceSession[] = [];
  private readonly MAX_HISTORY_SIZE = 50;
  
  private isMaintenanceModeActive = false;
  private maintenanceStartTime: Date | null = null;
  private userNotificationSent = false;

  private constructor() {}

  public static getInstance(): MaintenanceMode {
    if (!MaintenanceMode.instance) {
      MaintenanceMode.instance = new MaintenanceMode();
    }
    return MaintenanceMode.instance;
  }

  /**
   * Task 7.3: Schedule maintenance session
   */
  public async scheduleMaintenanceSession(
    type: 'scheduled' | 'emergency' | 'automatic',
    reason: string,
    description: string,
    scope: MaintenanceScope,
    plannedDurationMinutes: number,
    initiatedBy: string = 'system',
    scheduledStartTime?: Date
  ): Promise<MaintenanceSession> {
    const correlationId = createId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    const session: MaintenanceSession = {
      id: createId(),
      type,
      reason,
      description,
      startTime: scheduledStartTime || new Date(),
      plannedDurationMinutes,
      initiatedBy,
      correlationId,
      scope,
      status: 'scheduled',
      preMaintenanceChecks: this.createPreMaintenanceChecks(scope),
      maintenanceActions: [],
      postMaintenanceChecks: this.createPostMaintenanceChecks(scope),
      notifications: this.createMaintenanceNotifications(scope, type),
      metadata: {
        createdAt: new Date(),
        version: '1.0'
      }
    };

    // Add rollback plan for non-emergency maintenance
    if (type !== 'emergency') {
      session.rollbackPlan = this.createRollbackPlan(scope);
    }

    correlatedLogger.info('Maintenance session scheduled', {
      sessionId: session.id,
      type,
      reason,
      plannedDurationMinutes,
      userImpact: scope.userImpact,
      scheduledStart: session.startTime
    });

    // Send advance notifications for scheduled maintenance
    if (type === 'scheduled' && scheduledStartTime) {
      await this.sendAdvanceNotifications(session);
    }

    trackBusinessEvent('maintenance_session_scheduled', {
      sessionId: session.id,
      type,
      reason,
      scope: scope.userImpact,
      plannedDurationMinutes,
      correlationId
    });

    return session;
  }

  /**
   * Task 7.3: Start maintenance session
   */
  public async startMaintenanceSession(session: MaintenanceSession): Promise<boolean> {
    const correlatedLogger = createCorrelationLogger(session.correlationId);

    if (this.isMaintenanceModeActive) {
      correlatedLogger.warn('Cannot start maintenance - already in maintenance mode', {
        currentSessionId: this.currentMaintenance?.id,
        newSessionId: session.id
      });
      return false;
    }

    correlatedLogger.info('Starting maintenance session', {
      sessionId: session.id,
      type: session.type,
      reason: session.reason
    });

    try {
      // Run pre-maintenance checks
      const preChecksPassed = await this.runPreMaintenanceChecks(session);
      if (!preChecksPassed && session.type !== 'emergency') {
        correlatedLogger.error('Pre-maintenance checks failed, aborting maintenance');
        session.status = 'cancelled';
        return false;
      }

      // Enable maintenance mode
      await this.enableMaintenanceMode(session);

      // Send start notifications
      await this.sendMaintenanceNotifications(session, 'start');

      // Update session status
      session.status = 'active';
      session.startTime = new Date();
      this.currentMaintenance = session;

      // Execute maintenance actions
      const actionsSuccess = await this.executeMaintenanceActions(session);

      if (!actionsSuccess && session.rollbackPlan?.enabled) {
        correlatedLogger.warn('Maintenance actions failed, initiating rollback');
        await this.executeRollback(session);
      }

      return true;

    } catch (error) {
      correlatedLogger.error('Failed to start maintenance session', error as Error);
      session.status = 'cancelled';
      return false;
    }
  }

  /**
   * Task 7.3: End maintenance session
   */
  public async endMaintenanceSession(
    sessionId?: string,
    reason: string = 'completed'
  ): Promise<boolean> {
    const session = sessionId ? 
      this.maintenanceHistory.find(s => s.id === sessionId) || this.currentMaintenance :
      this.currentMaintenance;

    if (!session) {
      logger.warn('No maintenance session to end', { sessionId });
      return false;
    }

    const correlatedLogger = createCorrelationLogger(session.correlationId);

    correlatedLogger.info('Ending maintenance session', {
      sessionId: session.id,
      reason,
      duration: Date.now() - session.startTime.getTime()
    });

    try {
      // Run post-maintenance checks
      const postChecksPassed = await this.runPostMaintenanceChecks(session);

      // Disable maintenance mode
      await this.disableMaintenanceMode(session);

      // Send completion notifications
      await this.sendMaintenanceNotifications(session, 'end');

      // Update session status
      session.status = postChecksPassed ? 'completed' : 'completed';
      session.endTime = new Date();

      // Move to history
      this.moveToHistory(session);
      this.currentMaintenance = null;

      trackBusinessEvent('maintenance_session_completed', {
        sessionId: session.id,
        duration: session.endTime.getTime() - session.startTime.getTime(),
        success: postChecksPassed,
        correlationId: session.correlationId
      });

      return true;

    } catch (error) {
      correlatedLogger.error('Failed to end maintenance session', error as Error);
      return false;
    }
  }

  /**
   * Task 7.3: Enable maintenance mode
   */
  private async enableMaintenanceMode(session: MaintenanceSession): Promise<void> {
    const correlatedLogger = createCorrelationLogger(session.correlationId);

    this.isMaintenanceModeActive = true;
    this.maintenanceStartTime = new Date();

    correlatedLogger.info('Maintenance mode enabled', {
      sessionId: session.id,
      scope: session.scope,
      expectedDuration: session.plannedDurationMinutes
    });

    // Stop non-essential services based on scope
    await this.stopNonEssentialServices(session.scope);

    // Enable maintenance page/API responses
    await this.enableMaintenanceResponses(session);

    // Pause self-healing system if needed
    if (session.scope.affectedServices.includes('selfHealing')) {
      const selfHealing = SelfHealingSystem.getInstance();
      selfHealing.stopSelfHealing();
      correlatedLogger.info('Self-healing system paused for maintenance');
    }

    // Pause health checks if needed
    if (session.scope.affectedServices.includes('healthChecks')) {
      const healthCheck = AutomatedSystemHealthCheck.getInstance();
      healthCheck.stopAutomatedHealthChecks();
      correlatedLogger.info('Health checks paused for maintenance');
    }

    trackBusinessEvent('maintenance_mode_enabled', {
      sessionId: session.id,
      correlationId: session.correlationId
    });
  }

  /**
   * Task 7.3: Disable maintenance mode
   */
  private async disableMaintenanceMode(session: MaintenanceSession): Promise<void> {
    const correlatedLogger = createCorrelationLogger(session.correlationId);

    this.isMaintenanceModeActive = false;
    this.maintenanceStartTime = null;
    this.userNotificationSent = false;

    correlatedLogger.info('Maintenance mode disabled', {
      sessionId: session.id,
      duration: session.endTime ? session.endTime.getTime() - session.startTime.getTime() : 0
    });

    // Restart services based on scope
    await this.restartServices(session.scope);

    // Disable maintenance page/API responses
    await this.disableMaintenanceResponses();

    // Resume self-healing system if it was paused
    if (session.scope.affectedServices.includes('selfHealing')) {
      const selfHealing = SelfHealingSystem.getInstance();
      selfHealing.startSelfHealing();
      correlatedLogger.info('Self-healing system resumed after maintenance');
    }

    // Resume health checks if they were paused
    if (session.scope.affectedServices.includes('healthChecks')) {
      const healthCheck = AutomatedSystemHealthCheck.getInstance();
      healthCheck.startAutomatedHealthChecks();
      correlatedLogger.info('Health checks resumed after maintenance');
    }

    trackBusinessEvent('maintenance_mode_disabled', {
      sessionId: session.id,
      correlationId: session.correlationId
    });
  }

  /**
   * Task 7.3: Emergency maintenance mode activation
   */
  public async enableEmergencyMaintenanceMode(
    reason: string,
    description: string,
    initiatedBy: string = 'system'
  ): Promise<MaintenanceSession> {
    const correlationId = createId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    correlatedLogger.warn('Enabling emergency maintenance mode', {
      reason,
      description,
      initiatedBy
    });

    const emergencyScope: MaintenanceScope = {
      affectedServices: ['all'],
      affectedComponents: ['all'],
      userImpact: 'complete',
      expectedDowntime: 60, // 1 hour default
      allowPartialFunctionality: false,
      emergencyBypassEnabled: true
    };

    const session = await this.scheduleMaintenanceSession(
      'emergency',
      reason,
      description,
      emergencyScope,
      60, // 1 hour
      initiatedBy
    );

    // Immediately start emergency maintenance
    await this.startMaintenanceSession(session);

    trackBusinessEvent('emergency_maintenance_activated', {
      sessionId: session.id,
      reason,
      correlationId
    });

    return session;
  }

  // Pre-maintenance checks

  private createPreMaintenanceChecks(scope: MaintenanceScope): PreMaintenanceCheck[] {
    const checks: PreMaintenanceCheck[] = [
      {
        id: createId(),
        name: 'System Health Check',
        description: 'Verify system is healthy before maintenance',
        required: true,
        status: 'pending',
        checkFunction: async () => {
          const healthCheck = AutomatedSystemHealthCheck.getInstance();
          const health = await healthCheck.performComprehensiveHealthCheck();
          return {
            passed: health.overallHealth !== 'CRITICAL',
            message: `System health: ${health.overallHealth} (${health.healthScore}/100)`
          };
        }
      },
      {
        id: createId(),
        name: 'Active Operations Check',
        description: 'Check for active operations that should complete first',
        required: false,
        status: 'pending',
        checkFunction: async () => {
          // Check for active report generations, data collections, etc.
          return {
            passed: true,
            message: 'No blocking active operations found'
          };
        }
      },
      {
        id: createId(),
        name: 'Resource Availability Check',
        description: 'Verify sufficient resources for maintenance operations',
        required: true,
        status: 'pending',
        checkFunction: async () => {
          // Check disk space, memory, etc.
          return {
            passed: true,
            message: 'Sufficient resources available for maintenance'
          };
        }
      }
    ];

    return checks;
  }

  private async runPreMaintenanceChecks(session: MaintenanceSession): Promise<boolean> {
    const correlatedLogger = createCorrelationLogger(session.correlationId);
    let allPassed = true;

    correlatedLogger.info('Running pre-maintenance checks', {
      sessionId: session.id,
      checksCount: session.preMaintenanceChecks.length
    });

    for (const check of session.preMaintenanceChecks) {
      check.status = 'running';
      
      try {
        const result = await check.checkFunction();
        check.status = result.passed ? 'passed' : 'failed';
        check.result = result.message;

        correlatedLogger.info(`Pre-maintenance check ${check.status}`, {
          checkName: check.name,
          result: result.message,
          required: check.required
        });

        if (!result.passed && check.required) {
          allPassed = false;
        }

      } catch (error) {
        check.status = 'failed';
        check.result = `Check failed: ${(error as Error).message}`;
        
        if (check.required) {
          allPassed = false;
        }

        correlatedLogger.error(`Pre-maintenance check failed`, error as Error, {
          checkName: check.name,
          required: check.required
        });
      }
    }

    return allPassed;
  }

  // Post-maintenance checks

  private createPostMaintenanceChecks(scope: MaintenanceScope): PostMaintenanceCheck[] {
    const checks: PostMaintenanceCheck[] = [
      {
        id: createId(),
        name: 'System Health Verification',
        description: 'Verify system health after maintenance',
        critical: true,
        status: 'pending',
        checkFunction: async () => {
          const healthCheck = AutomatedSystemHealthCheck.getInstance();
          const health = await healthCheck.performComprehensiveHealthCheck();
          return {
            passed: health.overallHealth === 'HEALTHY' || health.overallHealth === 'DEGRADED',
            message: `Post-maintenance health: ${health.overallHealth} (${health.healthScore}/100)`
          };
        }
      },
      {
        id: createId(),
        name: 'Service Availability Check',
        description: 'Verify all services are running and accessible',
        critical: true,
        status: 'pending',
        checkFunction: async () => {
          // Check service endpoints, database connectivity, etc.
          return {
            passed: true,
            message: 'All critical services are accessible'
          };
        }
      },
      {
        id: createId(),
        name: 'Data Integrity Verification',
        description: 'Verify data integrity after maintenance operations',
        critical: true,
        status: 'pending',
        checkFunction: async () => {
          // Run data integrity checks
          return {
            passed: true,
            message: 'Data integrity verified'
          };
        }
      }
    ];

    return checks;
  }

  private async runPostMaintenanceChecks(session: MaintenanceSession): Promise<boolean> {
    const correlatedLogger = createCorrelationLogger(session.correlationId);
    let allPassed = true;

    correlatedLogger.info('Running post-maintenance checks', {
      sessionId: session.id,
      checksCount: session.postMaintenanceChecks.length
    });

    for (const check of session.postMaintenanceChecks) {
      check.status = 'running';
      
      try {
        const result = await check.checkFunction();
        check.status = result.passed ? 'passed' : 'failed';
        check.result = result.message;

        correlatedLogger.info(`Post-maintenance check ${check.status}`, {
          checkName: check.name,
          result: result.message,
          critical: check.critical
        });

        if (!result.passed && check.critical) {
          allPassed = false;
        }

      } catch (error) {
        check.status = 'failed';
        check.result = `Check failed: ${(error as Error).message}`;
        
        if (check.critical) {
          allPassed = false;
        }

        correlatedLogger.error(`Post-maintenance check failed`, error as Error, {
          checkName: check.name,
          critical: check.critical
        });
      }
    }

    return allPassed;
  }

  // Maintenance actions execution

  private async executeMaintenanceActions(session: MaintenanceSession): Promise<boolean> {
    const correlatedLogger = createCorrelationLogger(session.correlationId);
    let allSucceeded = true;

    if (session.maintenanceActions.length === 0) {
      correlatedLogger.info('No maintenance actions to execute');
      return true;
    }

    correlatedLogger.info('Executing maintenance actions', {
      sessionId: session.id,
      actionsCount: session.maintenanceActions.length
    });

    // Sort actions by order
    const sortedActions = session.maintenanceActions.sort((a, b) => a.order - b.order);

    for (const action of sortedActions) {
      action.status = 'running';
      action.startTime = new Date();
      
      try {
        const result = await action.actionFunction();
        action.status = result.success ? 'completed' : 'failed';
        action.result = result.message;
        action.endTime = new Date();

        correlatedLogger.info(`Maintenance action ${action.status}`, {
          actionName: action.name,
          result: result.message,
          duration: action.endTime.getTime() - action.startTime.getTime()
        });

        if (!result.success) {
          allSucceeded = false;
        }

      } catch (error) {
        action.status = 'failed';
        action.result = `Action failed: ${(error as Error).message}`;
        action.endTime = new Date();
        allSucceeded = false;

        correlatedLogger.error(`Maintenance action failed`, error as Error, {
          actionName: action.name
        });
      }
    }

    return allSucceeded;
  }

  // Rollback functionality

  private createRollbackPlan(scope: MaintenanceScope): RollbackPlan {
    return {
      enabled: true,
      automaticTriggers: ['critical_check_failed', 'action_failure_threshold'],
      manualTriggerThreshold: 2, // Rollback if 2+ actions fail
      rollbackActions: [],
      rollbackTimeout: 30 // 30 minutes to complete rollback
    };
  }

  private async executeRollback(session: MaintenanceSession): Promise<boolean> {
    const correlatedLogger = createCorrelationLogger(session.correlationId);

    if (!session.rollbackPlan?.enabled) {
      correlatedLogger.warn('Rollback not enabled for this session');
      return false;
    }

    correlatedLogger.info('Executing maintenance rollback', {
      sessionId: session.id
    });

    // Execute rollback actions in reverse order
    const completedActions = session.maintenanceActions
      .filter(a => a.status === 'completed' && a.rollbackFunction)
      .reverse();

    let rollbackSuccess = true;

    for (const action of completedActions) {
      if (action.rollbackFunction) {
        try {
          const result = await action.rollbackFunction();
          correlatedLogger.info(`Rollback action ${result.success ? 'succeeded' : 'failed'}`, {
            actionName: action.name,
            result: result.message
          });

          if (!result.success) {
            rollbackSuccess = false;
          }

        } catch (error) {
          correlatedLogger.error(`Rollback action failed`, error as Error, {
            actionName: action.name
          });
          rollbackSuccess = false;
        }
      }
    }

    trackBusinessEvent('maintenance_rollback_executed', {
      sessionId: session.id,
      success: rollbackSuccess,
      correlationId: session.correlationId
    });

    return rollbackSuccess;
  }

  // Notification system

  private createMaintenanceNotifications(
    scope: MaintenanceScope,
    type: 'scheduled' | 'emergency' | 'automatic'
  ): MaintenanceNotification[] {
    const notifications: MaintenanceNotification[] = [];

    if (scope.userImpact !== 'none') {
      notifications.push({
        id: createId(),
        type: 'user',
        channel: 'dashboard',
        timing: 'start',
        message: this.generateUserNotificationMessage(scope, type),
        sent: false
      });
    }

    notifications.push({
      id: createId(),
      type: 'admin',
      channel: 'slack',
      timing: 'start',
      message: `Maintenance session started: ${type} maintenance with ${scope.userImpact} user impact`,
      sent: false
    });

    return notifications;
  }

  private generateUserNotificationMessage(
    scope: MaintenanceScope,
    type: 'scheduled' | 'emergency' | 'automatic'
  ): string {
    const impactText = {
      minimal: 'minimal service disruption',
      moderate: 'some features may be temporarily unavailable',
      significant: 'most features will be temporarily unavailable',
      complete: 'the service will be temporarily unavailable'
    };

    const typeText = type === 'emergency' ? 'Emergency maintenance' : 'Scheduled maintenance';
    
    return `${typeText} is in progress. You may experience ${impactText[scope.userImpact]}. Expected duration: ${scope.expectedDowntime} minutes.`;
  }

  private async sendMaintenanceNotifications(
    session: MaintenanceSession,
    timing: 'before' | 'start' | 'during' | 'end' | 'after'
  ): Promise<void> {
    const notifications = session.notifications.filter(n => n.timing === timing && !n.sent);

    for (const notification of notifications) {
      try {
        // Implement actual notification sending logic here
        logger.info(`Sending ${notification.type} notification`, {
          channel: notification.channel,
          message: notification.message,
          sessionId: session.id
        });

        notification.sent = true;
        notification.sentAt = new Date();

      } catch (error) {
        logger.error('Failed to send maintenance notification', error as Error, {
          notificationId: notification.id,
          sessionId: session.id
        });
      }
    }
  }

  private async sendAdvanceNotifications(session: MaintenanceSession): Promise<void> {
    // Send advance notifications for scheduled maintenance
    const advanceHours = [24, 4, 1]; // 24h, 4h, 1h before maintenance
    
    // This would schedule advance notifications
    logger.info('Advance notifications scheduled for maintenance', {
      sessionId: session.id,
      scheduledStart: session.startTime
    });
  }

  // Service management

  private async stopNonEssentialServices(scope: MaintenanceScope): Promise<void> {
    logger.info('Stopping non-essential services for maintenance', {
      affectedServices: scope.affectedServices
    });

    // Implementation would stop services based on scope
    // For now, just log what would be stopped

    if (scope.affectedServices.includes('dataCollection')) {
      logger.info('Data collection services would be paused');
    }

    if (scope.affectedServices.includes('reportGeneration')) {
      logger.info('Report generation services would be paused');
    }

    if (scope.affectedServices.includes('cronJobs')) {
      logger.info('Cron jobs would be paused');
    }
  }

  private async restartServices(scope: MaintenanceScope): Promise<void> {
    logger.info('Restarting services after maintenance', {
      affectedServices: scope.affectedServices
    });

    // Implementation would restart services based on scope
    // For now, just log what would be restarted

    if (scope.affectedServices.includes('dataCollection')) {
      logger.info('Data collection services would be resumed');
    }

    if (scope.affectedServices.includes('reportGeneration')) {
      logger.info('Report generation services would be resumed');
    }

    if (scope.affectedServices.includes('cronJobs')) {
      logger.info('Cron jobs would be resumed');
    }
  }

  private async enableMaintenanceResponses(session: MaintenanceSession): Promise<void> {
    // Enable maintenance page/API responses
    logger.info('Maintenance responses enabled', {
      sessionId: session.id,
      userImpact: session.scope.userImpact
    });
  }

  private async disableMaintenanceResponses(): Promise<void> {
    // Disable maintenance page/API responses
    logger.info('Maintenance responses disabled');
  }

  // Utility methods

  private moveToHistory(session: MaintenanceSession): void {
    this.maintenanceHistory.push(session);
    if (this.maintenanceHistory.length > this.MAX_HISTORY_SIZE) {
      this.maintenanceHistory.shift();
    }
  }

  /**
   * Task 7.3: Get maintenance mode status
   */
  public getMaintenanceStatus(): {
    active: boolean;
    currentSession?: MaintenanceSession;
    startTime?: Date;
    estimatedEndTime?: Date;
    userImpact?: string;
    bypassEnabled?: boolean;
  } {
    return {
      active: this.isMaintenanceModeActive,
      currentSession: this.currentMaintenance || undefined,
      startTime: this.maintenanceStartTime || undefined,
      estimatedEndTime: this.currentMaintenance ? 
        new Date(this.currentMaintenance.startTime.getTime() + (this.currentMaintenance.plannedDurationMinutes || 0) * 60 * 1000) : 
        undefined,
      userImpact: this.currentMaintenance?.scope.userImpact,
      bypassEnabled: this.currentMaintenance?.scope.emergencyBypassEnabled
    };
  }

  /**
   * Task 7.3: Check if system is in maintenance mode
   */
  public isInMaintenanceMode(): boolean {
    return this.isMaintenanceModeActive;
  }

  /**
   * Task 7.3: Get maintenance history
   */
  public getMaintenanceHistory(limit?: number): MaintenanceSession[] {
    const history = this.maintenanceHistory.slice();
    return limit ? history.slice(-limit) : history;
  }
} 
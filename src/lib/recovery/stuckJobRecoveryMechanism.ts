import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import { cronJobRecoveryService, CronJobHealth } from './cronJobRecoveryService';

export interface StuckJobDetectionOptions {
  maxExecutionTime: number; // milliseconds
  checkInterval: number; // milliseconds
  stuckThreshold: number; // number of checks before considering stuck
  enableAutoRecovery: boolean;
  forceKillTimeout: number; // milliseconds
}

export interface StuckJobInfo {
  jobId: string;
  projectId?: string;
  startTime: Date;
  executionTime: number;
  isStuck: boolean;
  checkCount: number;
  lastHeartbeat?: Date;
  recoveryAction?: 'restart' | 'kill' | 'ignore';
}

export interface StuckJobRecoveryResult {
  success: boolean;
  stuckJobsFound: number;
  jobsRecovered: number;
  jobsKilled: number;
  recoveryTime: number;
  errors: string[];
  warnings: string[];
  recoveredJobs: {
    jobId: string;
    action: 'restarted' | 'killed' | 'ignored';
    recoveryTime: number;
  }[];
}

export class StuckJobRecoveryMechanism {
  private static instance: StuckJobRecoveryMechanism;
  private runningJobs: Map<string, StuckJobInfo> = new Map();
  private recoveryInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  public static getInstance(): StuckJobRecoveryMechanism {
    if (!StuckJobRecoveryMechanism.instance) {
      StuckJobRecoveryMechanism.instance = new StuckJobRecoveryMechanism();
    }
    return StuckJobRecoveryMechanism.instance;
  }

  /**
   * Start monitoring for stuck jobs
   * Task 3.2: Main stuck job monitoring
   */
  public startStuckJobMonitoring(options: StuckJobDetectionOptions): void {
    if (this.isMonitoring) {
      logger.warn('Stuck job monitoring is already running');
      return;
    }

    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'startStuckJobMonitoring' };

    logger.info('Starting stuck job monitoring', {
      ...context,
      maxExecutionTime: options.maxExecutionTime,
      checkInterval: options.checkInterval,
      autoRecovery: options.enableAutoRecovery
    });

    this.isMonitoring = true;

    // Start periodic monitoring
    this.recoveryInterval = setInterval(async () => {
      try {
        await this.checkForStuckJobs(options);
      } catch (error) {
        logger.error('Error during stuck job check', error as Error, context);
      }
    }, options.checkInterval);

    trackBusinessEvent('stuck_job_monitoring_started', {
      correlationId,
      maxExecutionTime: options.maxExecutionTime,
      checkInterval: options.checkInterval,
      autoRecovery: options.enableAutoRecovery
    });
  }

  /**
   * Stop monitoring for stuck jobs
   */
  public stopStuckJobMonitoring(): void {
    if (!this.isMonitoring) {
      logger.warn('Stuck job monitoring is not running');
      return;
    }

    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = undefined;
    }

    this.isMonitoring = false;
    logger.info('Stopped stuck job monitoring');

    trackBusinessEvent('stuck_job_monitoring_stopped', {
      correlationId: generateCorrelationId()
    });
  }

  /**
   * Register a job as started
   */
  public registerJobStart(jobId: string, projectId?: string): void {
    const jobInfo: StuckJobInfo = {
      jobId,
      projectId,
      startTime: new Date(),
      executionTime: 0,
      isStuck: false,
      checkCount: 0,
      lastHeartbeat: new Date()
    };

    this.runningJobs.set(jobId, jobInfo);
    
    logger.debug('Job registered as started', {
      jobId,
      projectId,
      startTime: jobInfo.startTime
    });
  }

  /**
   * Register a job heartbeat (job is still alive)
   */
  public registerJobHeartbeat(jobId: string): void {
    const jobInfo = this.runningJobs.get(jobId);
    if (jobInfo) {
      jobInfo.lastHeartbeat = new Date();
      jobInfo.checkCount = 0; // Reset check count on heartbeat
      
      logger.debug('Job heartbeat registered', {
        jobId,
        lastHeartbeat: jobInfo.lastHeartbeat
      });
    }
  }

  /**
   * Register a job as completed
   */
  public registerJobCompletion(jobId: string, success: boolean): void {
    const jobInfo = this.runningJobs.get(jobId);
    if (jobInfo) {
      this.runningJobs.delete(jobId);
      
      logger.debug('Job registered as completed', {
        jobId,
        success,
        executionTime: Date.now() - jobInfo.startTime.getTime()
      });
    }
  }

  /**
   * Check for stuck jobs and optionally recover them
   */
  private async checkForStuckJobs(options: StuckJobDetectionOptions): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'checkForStuckJobs' };
    
    const now = Date.now();
    const stuckJobs: StuckJobInfo[] = [];

    // Check all running jobs
    for (const [jobId, jobInfo] of this.runningJobs) {
      jobInfo.executionTime = now - jobInfo.startTime.getTime();
      
      // Check if job has exceeded max execution time
      if (jobInfo.executionTime > options.maxExecutionTime) {
        jobInfo.checkCount++;
        
        // Check heartbeat if available
        const timeSinceHeartbeat = jobInfo.lastHeartbeat ? 
          now - jobInfo.lastHeartbeat.getTime() : jobInfo.executionTime;
        
        // Consider stuck if no heartbeat for threshold period
        if (jobInfo.checkCount >= options.stuckThreshold || 
            timeSinceHeartbeat > options.maxExecutionTime) {
          
          jobInfo.isStuck = true;
          stuckJobs.push(jobInfo);
          
          logger.warn('Stuck job detected', {
            ...context,
            jobId,
            projectId: jobInfo.projectId,
            executionTime: jobInfo.executionTime,
            checkCount: jobInfo.checkCount,
            timeSinceHeartbeat
          });
        }
      }
    }

    // Recover stuck jobs if auto-recovery is enabled
    if (stuckJobs.length > 0 && options.enableAutoRecovery) {
      logger.info('Starting automatic recovery of stuck jobs', {
        ...context,
        stuckJobCount: stuckJobs.length
      });

      for (const stuckJob of stuckJobs) {
        try {
          await this.recoverStuckJob(stuckJob, options);
        } catch (error) {
          logger.error('Failed to recover stuck job', error as Error, {
            ...context,
            jobId: stuckJob.jobId
          });
        }
      }
    }

    // Track stuck job detection
    if (stuckJobs.length > 0) {
      trackBusinessEvent('stuck_jobs_detected', {
        correlationId,
        stuckJobCount: stuckJobs.length,
        autoRecoveryEnabled: options.enableAutoRecovery,
        stuckJobIds: stuckJobs.map(j => j.jobId)
      });
    }
  }

  /**
   * Recover a stuck job
   */
  private async recoverStuckJob(stuckJob: StuckJobInfo, options: StuckJobDetectionOptions): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { 
      correlationId, 
      jobId: stuckJob.jobId, 
      projectId: stuckJob.projectId,
      operation: 'recoverStuckJob' 
    };

    logger.info('Attempting to recover stuck job', {
      ...context,
      executionTime: stuckJob.executionTime,
      stuckFor: Date.now() - stuckJob.startTime.getTime()
    });

    try {
      // Step 1: Try graceful recovery first
      const gracefulRecovery = await this.attemptGracefulRecovery(stuckJob);
      
      if (gracefulRecovery.success) {
        stuckJob.recoveryAction = 'restart';
        this.runningJobs.delete(stuckJob.jobId);
        
        logger.info('Stuck job recovered gracefully', {
          ...context,
          recoveryMethod: 'graceful_restart'
        });
        
        trackBusinessEvent('stuck_job_recovered', {
          correlationId,
          jobId: stuckJob.jobId,
          recoveryMethod: 'graceful_restart',
          executionTime: stuckJob.executionTime
        });
        
        return;
      }

      // Step 2: Force kill if graceful recovery failed
      if (stuckJob.executionTime > options.forceKillTimeout) {
        const forceKillResult = await this.forceKillStuckJob(stuckJob);
        
        if (forceKillResult.success) {
          stuckJob.recoveryAction = 'kill';
          this.runningJobs.delete(stuckJob.jobId);
          
          logger.warn('Stuck job force-killed', {
            ...context,
            recoveryMethod: 'force_kill'
          });
          
          trackBusinessEvent('stuck_job_force_killed', {
            correlationId,
            jobId: stuckJob.jobId,
            executionTime: stuckJob.executionTime
          });
          
          // Try to restart the job after killing
          await this.restartJobAfterKill(stuckJob);
        }
      }

      // Step 3: Mark as ignored if all recovery attempts failed
      stuckJob.recoveryAction = 'ignore';
      logger.error('Failed to recover stuck job, marking as ignored', new Error('Recovery failed'), context);

    } catch (error) {
      logger.error('Error during stuck job recovery', error as Error, context);
      stuckJob.recoveryAction = 'ignore';
    }
  }

  /**
   * Attempt graceful recovery of a stuck job
   */
  private async attemptGracefulRecovery(stuckJob: StuckJobInfo): Promise<{ success: boolean; error?: string }> {
    const context = { jobId: stuckJob.jobId, projectId: stuckJob.projectId };
    
    try {
      // Get current job health from cron job recovery service
      const healthStatus = await cronJobRecoveryService.getHealthStatus();
      const jobHealth = healthStatus.find(h => h.jobId === stuckJob.jobId);
      
      if (jobHealth) {
        // Use the existing cron job recovery mechanism
        const recoveryResult = await cronJobRecoveryService.fixDegradedCronJobs({
          forceRestart: true,
          cleanupZombieJobs: false
        });
        
        return { success: recoveryResult.success };
      }
      
      return { success: false, error: 'Job not found in health status' };
      
    } catch (error) {
      logger.error('Graceful recovery failed', error as Error, context);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Force kill a stuck job
   */
  private async forceKillStuckJob(stuckJob: StuckJobInfo): Promise<{ success: boolean; error?: string }> {
    const context = { jobId: stuckJob.jobId, projectId: stuckJob.projectId };
    
    try {
      // In a real implementation, this would forcefully terminate the job process
      // For now, we'll simulate this by removing it from our tracking
      logger.warn('Force-killing stuck job (simulated)', context);
      
      // TODO: Implement actual process termination logic
      // This might involve:
      // - Sending SIGTERM/SIGKILL to job processes
      // - Cleaning up job-related resources
      // - Updating database records
      
      return { success: true };
      
    } catch (error) {
      logger.error('Force kill failed', error as Error, context);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Restart a job after killing it
   */
  private async restartJobAfterKill(stuckJob: StuckJobInfo): Promise<void> {
    const context = { jobId: stuckJob.jobId, projectId: stuckJob.projectId };
    
    try {
      if (stuckJob.projectId) {
        logger.info('Restarting job after force-kill', context);
        
        // Use cron job recovery service to restart the job
        await cronJobRecoveryService.fixDegradedCronJobs({
          forceRestart: true
        });
        
        logger.info('Job restarted successfully after force-kill', context);
      }
    } catch (error) {
      logger.error('Failed to restart job after force-kill', error as Error, context);
    }
  }

  /**
   * Get current status of all running jobs
   */
  public getRunningJobsStatus(): StuckJobInfo[] {
    const now = Date.now();
    const jobs: StuckJobInfo[] = [];
    
    for (const [jobId, jobInfo] of this.runningJobs) {
      jobs.push({
        ...jobInfo,
        executionTime: now - jobInfo.startTime.getTime()
      });
    }
    
    return jobs;
  }

  /**
   * Recover all stuck jobs manually
   */
  public async recoverAllStuckJobs(options: StuckJobDetectionOptions): Promise<StuckJobRecoveryResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'recoverAllStuckJobs' };

    logger.info('Starting manual recovery of all stuck jobs', context);

    const result: StuckJobRecoveryResult = {
      success: false,
      stuckJobsFound: 0,
      jobsRecovered: 0,
      jobsKilled: 0,
      recoveryTime: 0,
      errors: [],
      warnings: [],
      recoveredJobs: []
    };

    try {
      // Force a stuck job check
      await this.checkForStuckJobs(options);
      
      const stuckJobs = Array.from(this.runningJobs.values()).filter(job => job.isStuck);
      result.stuckJobsFound = stuckJobs.length;

      for (const stuckJob of stuckJobs) {
        const jobStartTime = Date.now();
        
        try {
          await this.recoverStuckJob(stuckJob, options);
          
          const jobRecoveryTime = Date.now() - jobStartTime;
          
          if (stuckJob.recoveryAction === 'restart') {
            result.jobsRecovered++;
          } else if (stuckJob.recoveryAction === 'kill') {
            result.jobsKilled++;
          }
          
          result.recoveredJobs.push({
            jobId: stuckJob.jobId,
            action: stuckJob.recoveryAction === 'restart' ? 'restarted' : 
                   stuckJob.recoveryAction === 'kill' ? 'killed' : 'ignored',
            recoveryTime: jobRecoveryTime
          });
          
        } catch (error) {
          result.errors.push(`Failed to recover job ${stuckJob.jobId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.recoveryTime = Date.now() - startTime;
      result.success = result.errors.length === 0 && result.stuckJobsFound > 0;

      logger.info('Manual stuck job recovery completed', {
        ...context,
        ...result
      });

      trackBusinessEvent('manual_stuck_job_recovery_completed', {
        correlationId,
        stuckJobsFound: result.stuckJobsFound,
        jobsRecovered: result.jobsRecovered,
        jobsKilled: result.jobsKilled,
        recoveryTime: result.recoveryTime,
        success: result.success
      });

      return result;

    } catch (error) {
      result.errors.push(`Recovery process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.recoveryTime = Date.now() - startTime;
      
      logger.error('Manual stuck job recovery failed', error as Error, context);
      return result;
    }
  }

  /**
   * Get monitoring status
   */
  public getMonitoringStatus(): {
    isMonitoring: boolean;
    runningJobsCount: number;
    stuckJobsCount: number;
  } {
    const stuckJobsCount = Array.from(this.runningJobs.values()).filter(job => job.isStuck).length;
    
    return {
      isMonitoring: this.isMonitoring,
      runningJobsCount: this.runningJobs.size,
      stuckJobsCount
    };
  }
}

// Export singleton instance
export const stuckJobRecoveryMechanism = StuckJobRecoveryMechanism.getInstance(); 
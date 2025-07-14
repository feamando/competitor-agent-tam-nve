/**
 * Project Service - Core project management functionality
 * Provides centralized project CRUD operations and business logic
 */

import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
import { Project, ProjectStatus, ProjectPriority } from '@prisma/client';

export interface CreateProjectInput {
  name: string;
  description?: string;
  userId: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  parameters?: any;
  startDate?: Date;
  endDate?: Date;
  competitorIds?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  parameters?: any;
  endDate?: Date;
  competitorIds?: string[];
}

export interface ProjectWithRelations extends Project {
  competitors?: any[];
  products?: any[];
  reports?: any[];
}

export class ProjectService {
  /**
   * Create a new project
   */
  async createProject(input: CreateProjectInput): Promise<ProjectWithRelations> {
    const correlationId = generateCorrelationId();
    const context = { operation: 'createProject', correlationId, userId: input.userId };

    try {
      logger.info('Creating new project', {
        ...context,
        projectName: input.name,
        status: input.status || 'DRAFT'
      });

             const projectData = {
         name: input.name,
         description: input.description || null,
         userId: input.userId,
         status: input.status || 'DRAFT' as ProjectStatus,
         priority: input.priority || 'MEDIUM' as ProjectPriority,
         parameters: input.parameters || {},
         tags: [], // Required field for Prisma schema
         startDate: input.startDate || new Date(),
         endDate: input.endDate || null,
       };

      // Create project with optional competitor connections
      const project = await prisma.project.create({
        data: {
          ...projectData,
          ...(input.competitorIds && input.competitorIds.length > 0 ? {
            competitors: {
              connect: input.competitorIds.map(id => ({ id }))
            }
          } : {})
        },
        include: {
          products: true,
          reports: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      logger.info('Project created successfully', {
        ...context,
        projectId: project.id,
        projectName: project.name
      });

      return project;

    } catch (error) {
      logger.error('Failed to create project', error instanceof Error ? error : new Error(String(error)), {
        ...context,
        projectName: input.name
      });
      throw error;
    }
  }

  /**
   * Get project by ID
   */
  async getProjectById(projectId: string, userId?: string): Promise<ProjectWithRelations | null> {
    const correlationId = generateCorrelationId();
    const context = { operation: 'getProjectById', correlationId, projectId, userId };

    try {
      logger.info('Fetching project by ID', context);

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          ...(userId ? { userId } : {})
        },
        include: {
          products: true,
          reports: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (project) {
        logger.info('Project found', {
          ...context,
          projectName: project.name,
          status: project.status
        });
      } else {
        logger.warn('Project not found', context);
      }

      return project;

    } catch (error) {
      logger.error('Failed to fetch project', error instanceof Error ? error : new Error(String(error)), context);
      throw error;
    }
  }

  /**
   * Get all projects for a user
   */
  async getProjectsByUserId(userId: string): Promise<ProjectWithRelations[]> {
    const correlationId = generateCorrelationId();
    const context = { operation: 'getProjectsByUserId', correlationId, userId };

    try {
      logger.info('Fetching projects for user', context);

      const projects = await prisma.project.findMany({
        where: { userId },
        include: {
          products: true,
          competitors: true, // Add competitors to fix the frontend error
          reports: {
            orderBy: { createdAt: 'desc' },
            take: 3
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      logger.info('Projects fetched successfully', {
        ...context,
        projectCount: projects.length
      });

      return projects;

    } catch (error) {
      logger.error('Failed to fetch user projects', error instanceof Error ? error : new Error(String(error)), context);
      throw error;
    }
  }

  /**
   * Update a project
   */
  async updateProject(projectId: string, input: UpdateProjectInput, userId?: string): Promise<ProjectWithRelations> {
    const correlationId = generateCorrelationId();
    const context = { operation: 'updateProject', correlationId, projectId, userId };

    try {
      logger.info('Updating project', {
        ...context,
        updates: Object.keys(input)
      });

      // Build update data
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.parameters !== undefined) updateData.parameters = input.parameters;
      if (input.endDate !== undefined) updateData.endDate = input.endDate;

      // Handle competitor connections
      if (input.competitorIds !== undefined) {
        if (input.competitorIds.length > 0) {
          updateData.competitors = {
            set: input.competitorIds.map(id => ({ id }))
          };
        } else {
          updateData.competitors = {
            set: []
          };
        }
      }

      const project = await prisma.project.update({
        where: {
          id: projectId,
          ...(userId ? { userId } : {})
        },
        data: updateData,
        include: {
          products: true,
          reports: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      logger.info('Project updated successfully', {
        ...context,
        projectName: project.name,
        status: project.status
      });

      return project;

    } catch (error) {
      logger.error('Failed to update project', error instanceof Error ? error : new Error(String(error)), context);
      throw error;
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string, userId?: string): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { operation: 'deleteProject', correlationId, projectId, userId };

    try {
      logger.info('Deleting project', context);

      await prisma.project.delete({
        where: {
          id: projectId,
          ...(userId ? { userId } : {})
        }
      });

      logger.info('Project deleted successfully', context);

    } catch (error) {
      logger.error('Failed to delete project', error instanceof Error ? error : new Error(String(error)), context);
      throw error;
    }
  }

  /**
   * Get project statistics
   */
  async getProjectStats(projectId: string): Promise<{
    totalReports: number;
    activeCompetitors: number;
    totalProducts: number;
    lastReportDate?: Date;
  }> {
    const correlationId = generateCorrelationId();
    const context = { operation: 'getProjectStats', correlationId, projectId };

    try {
      logger.info('Fetching project statistics', context);

      const [totalReports, totalProducts, lastReport] = await Promise.all([
        prisma.report.count({
          where: { projectId }
        }),
        prisma.product.count({
          where: { projectId }
        }),
        prisma.report.findFirst({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        })
      ]);

      // Get active competitors count (this is a simplified approach)
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { 
          id: true 
        }
      });

      const stats = {
        totalReports,
        activeCompetitors: 0, // TODO: Implement when competitor relation is properly set up
        totalProducts,
        lastReportDate: lastReport?.createdAt
      };

      logger.info('Project statistics fetched', {
        ...context,
        stats
      });

      return stats;

    } catch (error) {
      logger.error('Failed to fetch project stats', error instanceof Error ? error : new Error(String(error)), context);
      throw error;
    }
  }
}

// Export singleton instance
export const projectService = new ProjectService(); 
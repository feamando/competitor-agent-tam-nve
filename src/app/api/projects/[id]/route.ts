import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        competitors: {
          select: {
            id: true,
            name: true,
            website: true,
            industry: true
          }
        },
        reports: {
          select: {
            id: true,
            name: true,
            title: true,
            status: true,
            createdAt: true,
            isInitialReport: true,
            dataCompletenessScore: true
          },
          orderBy: { createdAt: 'desc' }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
} 
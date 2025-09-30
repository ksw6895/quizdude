import { NextResponse } from 'next/server';

import { prisma } from '@quizdude/db';

export async function GET(
  _request: Request,
  { params }: { params: { lectureId: string } },
) {
  const { lectureId } = params;
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: {
      uploads: true,
      summaries: {
        orderBy: { createdAt: 'desc' },
      },
      quizzes: {
        orderBy: { createdAt: 'desc' },
      },
      jobs: {
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  if (!lecture) {
    return NextResponse.json({ error: 'lecture_not_found' }, { status: 404 });
  }

  const data = {
    id: lecture.id,
    title: lecture.title,
    description: lecture.description,
    language: lecture.language,
    modality: lecture.modality,
    audioPipelineEnabled: lecture.audioPipelineEnabled,
    createdAt: lecture.createdAt.toISOString(),
    updatedAt: lecture.updatedAt.toISOString(),
    uploads: lecture.uploads.map((upload) => ({
      id: upload.id,
      type: upload.type,
      status: upload.status,
      blobKey: upload.blobKey,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      metadata: upload.metadata,
      createdAt: upload.createdAt.toISOString(),
      updatedAt: upload.updatedAt.toISOString(),
    })),
    summaries: lecture.summaries.map((summary) => ({
      id: summary.id,
      createdAt: summary.createdAt.toISOString(),
      updatedAt: summary.updatedAt.toISOString(),
      model: summary.model,
      payload: summary.payload,
      rawResponse: summary.rawResponse,
      inputFiles: summary.inputFiles,
    })),
    quizzes: lecture.quizzes.map((quiz) => ({
      id: quiz.id,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
      model: quiz.model,
      payload: quiz.payload,
      rawResponse: quiz.rawResponse,
      inputFiles: quiz.inputFiles,
      summaryId: quiz.summaryId,
    })),
    jobs: lecture.jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      scheduledAt: job.scheduledAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      payload: job.payload,
      result: job.result,
      lastError: job.lastError,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    })),
  };

  return NextResponse.json({ lecture: data });
}

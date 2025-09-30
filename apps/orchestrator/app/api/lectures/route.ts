import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma, UploadStatus, UploadType, JobType, JobStatus } from '@quizdude/db';
import { isAudioPipelineEnabled } from '@quizdude/shared';

import { generateLectureUploadTargets } from '../../../lib/blobStorage';

const requestSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  language: z.string().default('ko'),
  modality: z.enum(['pdf_only', 'pdf_plus_media', 'media_only']).default('pdf_only'),
  audioPipelineRequested: z.boolean().default(false),
  uploads: z
    .array(
      z.object({
        kind: z.enum(['pdf', 'audio', 'video', 'transcript']),
        contentType: z.string().min(3),
        filename: z.string().min(1),
      }),
    )
    .default([]),
});

const uploadTypeMap: Record<string, UploadType> = {
  pdf: UploadType.PDF,
  audio: UploadType.AUDIO,
  video: UploadType.VIDEO,
  transcript: UploadType.TRANSCRIPT,
};

const jobTypeOrder: JobType[] = [JobType.SUMMARIZE, JobType.QUIZ, JobType.TRANSCRIBE];

const serializeJob = (job: { id: string; type: JobType; status: JobStatus; updatedAt: Date; lastError: string | null }) => ({
  id: job.id,
  type: job.type,
  status: job.status,
  updatedAt: job.updatedAt.toISOString(),
  lastError: job.lastError,
});

export async function GET() {
  const lectures = await prisma.lecture.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      uploads: true,
      summaries: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      quizzes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      jobs: {
        orderBy: { updatedAt: 'desc' },
        take: 6,
      },
    },
  });

  const data = lectures.map((lecture) => {
    const summary = lecture.summaries[0];
    const quiz = lecture.quizzes[0];
    const jobByType: Partial<Record<JobType, typeof lecture.jobs[number]>> = {};
    lecture.jobs.forEach((job) => {
      if (!jobByType[job.type]) {
        jobByType[job.type] = job;
        return;
      }
      if (job.updatedAt > jobByType[job.type]!.updatedAt) {
        jobByType[job.type] = job;
      }
    });

    const jobs = jobTypeOrder.reduce((acc, type) => {
      const job = jobByType[type];
      acc[type.toLowerCase()] = job ? serializeJob(job) : null;
      return acc;
    }, {} as Record<string, ReturnType<typeof serializeJob> | null>);

    return {
      id: lecture.id,
      title: lecture.title,
      description: lecture.description,
      language: lecture.language,
      modality: lecture.modality,
      audioPipelineEnabled: lecture.audioPipelineEnabled,
      createdAt: lecture.createdAt.toISOString(),
      uploads: lecture.uploads.map((upload) => ({
        id: upload.id,
        type: upload.type,
        status: upload.status,
        sizeBytes: upload.sizeBytes,
        contentType: upload.contentType,
        metadata: upload.metadata,
        updatedAt: upload.updatedAt.toISOString(),
      })),
      latestSummary: summary
        ? {
            id: summary.id,
            createdAt: summary.createdAt.toISOString(),
            model: summary.model,
            meta: (summary.payload as { meta?: unknown })?.meta ?? null,
          }
        : null,
      latestQuiz: quiz
        ? {
            id: quiz.id,
            createdAt: quiz.createdAt.toISOString(),
            model: quiz.model,
            itemCount: Array.isArray((quiz.payload as { items?: unknown }).items)
              ? (quiz.payload as { items: unknown[] }).items.length
              : null,
          }
        : null,
      jobs,
    };
  });

  return NextResponse.json({ lectures: data });
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const {
    title,
    description,
    language,
    modality,
    audioPipelineRequested,
    uploads,
  } = parsed.data;

  if (audioPipelineRequested && !isAudioPipelineEnabled()) {
    return NextResponse.json(
      {
        error: 'audio_pipeline_disabled',
        message: 'Audio pipeline is disabled by configuration.',
      },
      { status: 409 },
    );
  }

  const lecture = await prisma.lecture.create({
    data: {
      title,
      description,
      language,
      modality,
      audioPipelineEnabled: audioPipelineRequested && isAudioPipelineEnabled(),
    },
  });

  const targets = await generateLectureUploadTargets({
    lectureId: lecture.id,
    objects: uploads.map((upload) => ({
      kind: upload.kind,
      contentType: upload.contentType,
      filename: upload.filename,
    })),
  });

  if (targets.length > 0) {
    await prisma.$transaction(
      targets.map((target) =>
        prisma.upload.create({
          data: {
            lectureId: lecture.id,
            type: uploadTypeMap[target.kind],
            blobKey: target.id,
            uploadUrl: target.url,
            uploadToken: target.token,
            contentType: target.contentType,
            status: UploadStatus.REQUESTED,
          },
        }),
      ),
    );
  }

  return NextResponse.json({
    lectureId: lecture.id,
    uploads: targets,
    audioPipelineEnabled: lecture.audioPipelineEnabled,
  });
}

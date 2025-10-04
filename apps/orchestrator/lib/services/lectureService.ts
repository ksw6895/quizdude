import { prisma, UploadStatus, UploadType, JobType, JobStatus } from '@quizdude/db';
import type { Prisma } from '@quizdude/db';
import { z } from 'zod';

import { generateLectureUploadTargets } from '../blobStorage';
import { ApiError } from '../errors';
import { getRuntimeConfig } from '../config/env';

const createLectureSchema = z.object({
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

const uploadUpdateSchema = z.object({
  uploads: z.array(
    z.object({
      uploadId: z.string(),
      status: z.enum(['REQUESTED', 'UPLOADING', 'READY', 'FAILED']).optional(),
      sizeBytes: z.number().int().nonnegative().optional(),
      metadata: z.record(z.any()).optional(),
    }),
  ),
});

const jobTriggerSchema = z.object({
  force: z.boolean().default(false),
});

const transcribeTriggerSchema = jobTriggerSchema.extend({
  uploadId: z.string().optional(),
});

const uploadTypeMap: Record<string, UploadType> = {
  pdf: UploadType.PDF,
  audio: UploadType.AUDIO,
  video: UploadType.VIDEO,
  transcript: UploadType.TRANSCRIPT,
};

const jobTypeOrder: JobType[] = [JobType.SUMMARIZE, JobType.QUIZ, JobType.TRANSCRIBE];

type LectureListItem = Awaited<ReturnType<typeof listLectures>>['lectures'][number];

type LectureWithRelations = Prisma.LectureGetPayload<{
  include: {
    uploads: true;
    summaries: { orderBy: { createdAt: 'desc' }; take?: number };
    quizzes: { orderBy: { createdAt: 'desc' }; take?: number };
    jobs: { orderBy: { updatedAt: 'desc' }; take?: number };
  };
}>;

function serializeLectureForList(lecture: LectureWithRelations): LectureListItem {
  const summary = lecture.summaries[0];
  const quiz = lecture.quizzes[0];

  const jobByType: Partial<Record<JobType, (typeof lecture.jobs)[number]>> = {};
  lecture.jobs.forEach((job) => {
    const existing = jobByType[job.type];
    if (!existing || job.updatedAt > existing.updatedAt) {
      jobByType[job.type] = job;
    }
  });

  const jobs = jobTypeOrder.reduce<Record<string, unknown | null>>((acc, type) => {
    const job = jobByType[type];
    acc[type.toLowerCase()] = job
      ? {
          id: job.id,
          type: job.type,
          status: job.status,
          updatedAt: job.updatedAt.toISOString(),
          lastError: job.lastError,
        }
      : null;
    return acc;
  }, {});

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
    jobs: jobs as LectureListItem['jobs'],
  } satisfies LectureListItem;
}

function serializeLectureDetail(lecture: LectureWithRelations): {
  lecture: {
    id: string;
    title: string;
    description: string | null;
    language: string;
    modality: string;
    audioPipelineEnabled: boolean;
    createdAt: string;
    updatedAt: string;
    uploads: Array<{
      id: string;
      type: UploadType;
      status: UploadStatus;
      blobKey: string;
      contentType: string;
      sizeBytes: number | null;
      metadata: Prisma.JsonValue | null;
      createdAt: string;
      updatedAt: string;
    }>;
    summaries: Array<{
      id: string;
      createdAt: string;
      updatedAt: string;
      model: string;
      payload: Prisma.JsonValue;
      rawResponse: Prisma.JsonValue | null;
      inputFiles: Prisma.JsonValue | null;
    }>;
    quizzes: Array<{
      id: string;
      createdAt: string;
      updatedAt: string;
      model: string;
      payload: Prisma.JsonValue;
      rawResponse: Prisma.JsonValue | null;
      inputFiles: Prisma.JsonValue | null;
      summaryId: string | null;
    }>;
    jobs: Array<{
      id: string;
      type: JobType;
      status: JobStatus;
      attempts: number;
      scheduledAt: string;
      startedAt: string | null;
      completedAt: string | null;
      payload: Prisma.JsonValue | null;
      result: Prisma.JsonValue | null;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
} {
  return {
    lecture: {
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
    },
  };
}

async function assertLectureExists(lectureId: string) {
  const lecture = await prisma.lecture.findUnique({ where: { id: lectureId } });
  if (!lecture) {
    throw new ApiError(404, '강의를 찾을 수 없습니다.', {
      code: 'lecture_not_found',
    });
  }
  return lecture;
}

async function queueJob(options: {
  lectureId: string;
  type: JobType;
  force?: boolean;
  payload?: Prisma.InputJsonValue;
}) {
  const { lectureId, type, force = false, payload } = options;

  if (!force) {
    const existing = await prisma.jobRun.findFirst({
      where: {
        lectureId,
        type,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
    });

    if (existing) {
      throw new ApiError(409, '이미 실행 중인 잡이 있습니다.', {
        code: 'job_exists',
        details: { jobId: existing.id },
      });
    }
  }

  const job = await prisma.jobRun.create({
    data: {
      lectureId,
      type,
      status: JobStatus.PENDING,
      payload,
    },
  });

  return job;
}

export async function listLectures() {
  const lectures = await prisma.lecture.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      uploads: true,
      summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
      quizzes: { orderBy: { createdAt: 'desc' }, take: 1 },
      jobs: { orderBy: { updatedAt: 'desc' }, take: 6 },
    },
  });

  return {
    lectures: lectures.map(serializeLectureForList),
  };
}

export async function createLecture(payload: unknown) {
  const input = createLectureSchema.parse(payload);
  const runtimeConfig = getRuntimeConfig();

  const lecture = await prisma.lecture.create({
    data: {
      title: input.title,
      description: input.description,
      language: input.language,
      modality: input.modality,
      audioPipelineEnabled: input.audioPipelineRequested && runtimeConfig.features.audioPipeline,
    },
  });

  if (!runtimeConfig.blob.readWriteToken) {
    throw new ApiError(500, 'Blob 업로드 구성이 누락되었습니다.', {
      code: 'blob_config_missing',
    });
  }

  const targets = await generateLectureUploadTargets({
    lectureId: lecture.id,
    objects: input.uploads.map((upload) => ({
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

  return {
    lectureId: lecture.id,
    uploads: targets,
    audioPipelineEnabled: lecture.audioPipelineEnabled,
  };
}

export async function getLectureDetail(lectureId: string) {
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: {
      uploads: true,
      summaries: { orderBy: { createdAt: 'desc' } },
      quizzes: { orderBy: { createdAt: 'desc' } },
      jobs: { orderBy: { updatedAt: 'desc' } },
    },
  });

  if (!lecture) {
    throw new ApiError(404, '강의를 찾을 수 없습니다.', {
      code: 'lecture_not_found',
    });
  }

  return serializeLectureDetail(lecture);
}

export async function updateUploadStatuses(lectureId: string, payload: unknown) {
  await assertLectureExists(lectureId);
  const input = uploadUpdateSchema.parse(payload);

  await prisma.$transaction(
    input.uploads.map((upload) =>
      prisma.upload.update({
        where: { id: upload.uploadId },
        data: {
          status: upload.status
            ? UploadStatus[upload.status as keyof typeof UploadStatus]
            : undefined,
          sizeBytes: upload.sizeBytes,
          metadata: upload.metadata as Prisma.InputJsonValue | undefined,
        },
      }),
    ),
  );

  return { ok: true };
}

export async function triggerSummarize(lectureId: string, payload: unknown) {
  await assertLectureExists(lectureId);
  const input = jobTriggerSchema.parse(payload ?? {});

  const job = await queueJob({
    lectureId,
    type: JobType.SUMMARIZE,
    force: input.force,
  });

  return { jobId: job.id };
}

export async function triggerQuiz(lectureId: string, payload: unknown) {
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: { summaries: true },
  });

  if (!lecture) {
    throw new ApiError(404, '강의를 찾을 수 없습니다.', {
      code: 'lecture_not_found',
    });
  }

  if (lecture.summaries.length === 0) {
    throw new ApiError(409, '요약이 먼저 필요합니다.', {
      code: 'summary_missing',
      details: {
        message: 'Generate a summary before creating a quiz.',
      },
    });
  }

  const input = jobTriggerSchema.parse(payload ?? {});

  const job = await queueJob({
    lectureId,
    type: JobType.QUIZ,
    force: input.force,
  });

  return { jobId: job.id };
}

export async function triggerTranscription(lectureId: string, payload: unknown) {
  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig.features.audioPipeline) {
    throw new ApiError(409, '오디오 파이프라인이 비활성화되어 있습니다.', {
      code: 'audio_pipeline_disabled',
    });
  }

  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: { uploads: true },
  });

  if (!lecture) {
    throw new ApiError(404, '강의를 찾을 수 없습니다.', {
      code: 'lecture_not_found',
    });
  }

  if (!lecture.audioPipelineEnabled) {
    throw new ApiError(409, '해당 강의에 오디오 파이프라인이 활성화되지 않았습니다.', {
      code: 'audio_pipeline_disabled_for_lecture',
    });
  }

  const input = transcribeTriggerSchema.parse(payload ?? {});

  const candidateUpload = input.uploadId
    ? lecture.uploads.find((upload) => upload.id === input.uploadId)
    : lecture.uploads.find(
        (upload) => upload.type === UploadType.AUDIO || upload.type === UploadType.VIDEO,
      );

  if (!candidateUpload) {
    throw new ApiError(409, '오디오/비디오 업로드를 찾을 수 없습니다.', {
      code: 'media_upload_not_found',
    });
  }

  const job = await queueJob({
    lectureId,
    type: JobType.TRANSCRIBE,
    force: input.force,
    payload: {
      uploadId: candidateUpload.id,
    } as Prisma.InputJsonValue,
  });

  return { jobId: job.id };
}

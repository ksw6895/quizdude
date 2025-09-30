import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma, JobStatus, JobType, UploadType } from '@quizdude/db';
import { isAudioPipelineEnabled } from '@quizdude/shared';

const bodySchema = z.object({
  uploadId: z.string().optional(),
  force: z.boolean().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: { lectureId: string } },
) {
  if (!isAudioPipelineEnabled()) {
    return NextResponse.json(
      {
        error: 'audio_pipeline_disabled',
      },
      { status: 409 },
    );
  }

  const { lectureId } = params;
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: {
      uploads: true,
    },
  });

  if (!lecture) {
    return NextResponse.json({ error: 'lecture_not_found' }, { status: 404 });
  }

  if (!lecture.audioPipelineEnabled) {
    return NextResponse.json(
      {
        error: 'audio_pipeline_disabled_for_lecture',
      },
      { status: 409 },
    );
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const candidateUpload =
    parsed.data.uploadId
      ? lecture.uploads.find((upload) => upload.id === parsed.data.uploadId)
      : lecture.uploads.find((upload) =>
          upload.type === UploadType.AUDIO || upload.type === UploadType.VIDEO,
        );

  if (!candidateUpload) {
    return NextResponse.json(
      {
        error: 'media_upload_not_found',
        message: 'Upload audio/video media before requesting transcription.',
      },
      { status: 409 },
    );
  }

  if (!parsed.data.force) {
    const existing = await prisma.jobRun.findFirst({
      where: {
        lectureId,
        type: JobType.TRANSCRIBE,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
    });
    if (existing) {
      return NextResponse.json({ error: 'job_exists', jobId: existing.id }, { status: 409 });
    }
  }

  const job = await prisma.jobRun.create({
    data: {
      lectureId,
      type: JobType.TRANSCRIBE,
      status: JobStatus.PENDING,
      payload: {
        uploadId: candidateUpload.id,
      },
    },
  });

  return NextResponse.json({ jobId: job.id });
}

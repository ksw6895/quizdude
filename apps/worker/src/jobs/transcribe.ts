import { AbortError } from 'p-retry';

import { prisma, JobStatus } from '@quizdude/db';
import type { JobRun } from '@quizdude/db';
import { isAudioPipelineEnabled } from '@quizdude/shared';
import { z } from 'zod';

import { TemporaryError } from '../errors.js';
import type { Logger } from '../logger.js';

const transcribePayloadSchema = z.object({
  uploadId: z.string(),
  transcriptText: z.string().optional(),
  diarization: z.any().optional(),
  language: z.string().optional(),
  durationSeconds: z.number().optional(),
});

export async function runTranscriptionJob(job: JobRun, logger: Logger) {
  const payload = transcribePayloadSchema.parse(job.payload ?? {});

  if (!payload.transcriptText) {
    throw new TemporaryError('Transcript text not yet available from upstream.');
  }

  if (!payload.uploadId) {
    throw new AbortError('Transcription payload missing uploadId.');
  }

  if (!isAudioPipelineEnabled()) {
    throw new AbortError('Audio pipeline disabled at runtime');
  }

  logger.info('transcribe:upsert', {
    jobId: job.id,
    lectureId: job.lectureId,
    uploadId: payload.uploadId,
  });

  const transcript = await prisma.transcript.upsert({
    where: {
      lectureId_sourceUploadId: {
        lectureId: job.lectureId,
        sourceUploadId: payload.uploadId,
      },
    },
    create: {
      lectureId: job.lectureId,
      sourceUploadId: payload.uploadId,
      status: JobStatus.SUCCEEDED,
      text: payload.transcriptText,
      diarization: payload.diarization ?? null,
      language: payload.language,
      durationSeconds: payload.durationSeconds,
    },
    update: {
      status: JobStatus.SUCCEEDED,
      text: payload.transcriptText,
      diarization: payload.diarization ?? null,
      language: payload.language,
      durationSeconds: payload.durationSeconds,
    },
  });

  logger.info('transcribe:completed', {
    jobId: job.id,
    lectureId: job.lectureId,
    transcriptId: transcript.id,
  });

  return { transcriptId: transcript.id };
}

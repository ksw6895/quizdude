import pRetry, { AbortError } from 'p-retry';
import { setTimeout as sleep } from 'node:timers/promises';

import { prisma, JobType, JobStatus, type JobRun, Prisma } from '@quizdude/db';
import { isAudioPipelineEnabled } from '@quizdude/shared';

import { getWorkerConfig } from './config/env.js';
import { TemporaryError } from './errors.js';
import { runSummarizeJob } from './jobs/summarize.js';
import { runQuizJob } from './jobs/quiz.js';
import { runTranscriptionJob } from './jobs/transcribe.js';
import { createLogger } from './logger.js';
import type { Logger } from './logger.js';

const config = getWorkerConfig();

async function claimNextJob(): Promise<JobRun | null> {
  const job = await prisma.jobRun.findFirst({
    where: {
      status: JobStatus.PENDING,
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  if (!job) {
    return null;
  }

  const updated = await prisma.jobRun.updateMany({
    where: { id: job.id, status: JobStatus.PENDING },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return prisma.jobRun.findUnique({ where: { id: job.id } });
}

async function completeJob(jobId: string, data: Prisma.JobRunUpdateInput) {
  await prisma.jobRun.update({
    where: { id: jobId },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });
}

async function executeJob(job: JobRun, logger: Logger) {
  switch (job.type) {
    case JobType.SUMMARIZE:
      return pRetry(() => runSummarizeJob(job, logger), { retries: 0 });
    case JobType.QUIZ:
      return pRetry(() => runQuizJob(job, logger), { retries: 0 });
    case JobType.TRANSCRIBE:
      if (!isAudioPipelineEnabled()) {
        throw new AbortError('Audio pipeline disabled at runtime');
      }
      return pRetry(() => runTranscriptionJob(job, logger), { retries: 2 });
    default:
      throw new AbortError(`Unsupported job type: ${job.type}`);
  }
}

async function processJob(job: JobRun, logger: Logger) {
  try {
    logger.info('job:processing', {
      jobId: job.id,
      lectureId: job.lectureId,
      type: job.type,
      attempts: job.attempts,
    });

    const result = await executeJob(job, logger);

    await completeJob(job.id, {
      status: JobStatus.SUCCEEDED,
      completedAt: new Date(),
      result: result == null ? Prisma.JsonNull : (result as Prisma.InputJsonValue),
      lastError: null,
    });

    logger.info('job:success', {
      jobId: job.id,
      lectureId: job.lectureId,
      type: job.type,
    });
  } catch (error) {
    const attempts = job.attempts;
    const isAbort = error instanceof AbortError;
    const finalAttempt = attempts >= config.maxAttempts || isAbort;
    const delayMs = Math.min(600_000, 2 ** attempts * 1000);
    const nextSchedule = finalAttempt ? job.scheduledAt : new Date(Date.now() + delayMs);

    await completeJob(job.id, {
      status: finalAttempt ? JobStatus.NEEDS_ATTENTION : JobStatus.PENDING,
      scheduledAt: nextSchedule,
      lastError: error instanceof Error ? error.message : 'Unknown error',
    });

    const payload = {
      jobId: job.id,
      lectureId: job.lectureId,
      type: job.type,
      attempts,
      finalAttempt,
      retryInMs: finalAttempt ? null : delayMs,
      error: error instanceof Error ? error.message : String(error),
    };

    if (error instanceof TemporaryError) {
      logger.warn('job:temporary-failure', payload);
    } else {
      logger.error('job:failed', payload);
    }
  }
}

async function workerLoop(workerIndex: number) {
  const workerId = `${config.instanceId}:${workerIndex}`;
  const logger = createLogger({ workerId });

  logger.info('worker:boot', {
    pollIntervalMs: config.pollIntervalMs,
    maxAttempts: config.maxAttempts,
    concurrency: config.concurrency,
  });

  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      logger.info('job:claimed', {
        jobId: job.id,
        lectureId: job.lectureId,
        type: job.type,
        attempts: job.attempts,
      });

      await processJob(job, logger);
    } catch (error) {
      logger.error('worker:loop-error', {
        message: error instanceof Error ? error.message : String(error),
      });
      await sleep(config.pollIntervalMs);
    }
  }
}

async function start() {
  const workers = Array.from({ length: config.concurrency }, (_, index) =>
    workerLoop(index + 1).catch((error) => {
      const workerId = `${config.instanceId}:${index + 1}`;
      createLogger({ workerId }).error('worker:fatal', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }),
  );

  await Promise.all(workers);
}

start().catch((error) => {
  console.error('[worker] fatal error', error);
  process.exit(1);
});

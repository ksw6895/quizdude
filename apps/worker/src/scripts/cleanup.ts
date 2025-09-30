import { prisma, JobStatus } from '@quizdude/db';

const PROCESSING_TIMEOUT_MINUTES = Number(process.env.JOB_PROCESSING_TIMEOUT_MINUTES ?? 15);
const MAX_ATTEMPTS = Number(process.env.JOB_CLEANUP_MAX_ATTEMPTS ?? 5);
const RESCHEDULE_DELAY_SECONDS = Number(process.env.JOB_RESCHEDULE_DELAY_SECONDS ?? 60);

async function requeueStuckProcessingJobs() {
  const threshold = new Date(Date.now() - PROCESSING_TIMEOUT_MINUTES * 60_000);

  const stuckJobs = await prisma.jobRun.findMany({
    where: {
      status: JobStatus.PROCESSING,
      startedAt: { not: null, lt: threshold },
    },
  });

  if (stuckJobs.length === 0) {
    console.log('No stuck PROCESSING jobs detected.');
    return { requeued: 0, escalated: 0 };
  }

  const rescheduleAt = new Date(Date.now() + RESCHEDULE_DELAY_SECONDS * 1000);

  const requeueCandidates = stuckJobs.filter((job) => job.attempts < MAX_ATTEMPTS);
  const escalateCandidates = stuckJobs.filter((job) => job.attempts >= MAX_ATTEMPTS);

  const rescheduled = await Promise.all(
    requeueCandidates.map(async (job) =>
      prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: JobStatus.PENDING,
          scheduledAt: rescheduleAt,
          lastError: 'Auto-rescheduled by cleanup: processing timeout exceeded.',
        },
      }),
    ),
  );

  const escalated = await Promise.all(
    escalateCandidates.map(async (job) =>
      prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: JobStatus.NEEDS_ATTENTION,
          completedAt: new Date(),
          lastError: 'Escalated by cleanup: max attempts reached while processing.',
        },
      }),
    ),
  );

  if (rescheduled.length > 0) {
    console.log(`Requeued ${rescheduled.length} job(s) still marked PROCESSING after timeout.`);
  }
  if (escalated.length > 0) {
    console.log(`Escalated ${escalated.length} stuck PROCESSING job(s) past max attempts.`);
  }

  return { requeued: rescheduled.length, escalated: escalated.length };
}

async function escalateExceededAttempts() {
  const exhausted = await prisma.jobRun.updateMany({
    where: {
      status: JobStatus.PENDING,
      attempts: { gte: MAX_ATTEMPTS },
    },
    data: {
      status: JobStatus.NEEDS_ATTENTION,
      lastError: 'Escalated by cleanup: max attempts exceeded.',
    },
  });

  if (exhausted.count > 0) {
    console.log(`Escalated ${exhausted.count} job(s) past max attempts.`);
  } else {
    console.log('No pending jobs exceeded max attempts.');
  }

  return { escalated: exhausted.count };
}

async function main() {
  const stuckSummary = await requeueStuckProcessingJobs();
  const exhaustedSummary = await escalateExceededAttempts();

  const summary = {
    requeued: stuckSummary.requeued,
    escalatedFromProcessing: stuckSummary.escalated,
    escalatedFromPending: exhaustedSummary.escalated,
  };

  console.log('Cleanup summary:', summary);
}

main()
  .catch((error) => {
    console.error('Cleanup failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma, JobStatus, JobType } from '@quizdude/db';

const bodySchema = z.object({
  force: z.boolean().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: { lectureId: string } },
) {
  const { lectureId } = params;
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: { summaries: true },
  });

  if (!lecture) {
    return NextResponse.json({ error: 'lecture_not_found' }, { status: 404 });
  }

  if (lecture.summaries.length === 0) {
    return NextResponse.json(
      {
        error: 'summary_missing',
        message: 'Generate a summary before creating a quiz.',
      },
      { status: 409 },
    );
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  if (!parsed.data.force) {
    const existing = await prisma.jobRun.findFirst({
      where: {
        lectureId,
        type: JobType.QUIZ,
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
      type: JobType.QUIZ,
      status: JobStatus.PENDING,
    },
  });

  return NextResponse.json({ jobId: job.id });
}

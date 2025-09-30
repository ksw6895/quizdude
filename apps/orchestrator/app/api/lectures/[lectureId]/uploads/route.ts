import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma, UploadStatus } from '@quizdude/db';

const bodySchema = z.object({
  uploads: z.array(
    z.object({
      uploadId: z.string(),
      status: z.enum(['REQUESTED', 'UPLOADING', 'READY', 'FAILED']).optional(),
      sizeBytes: z.number().int().nonnegative().optional(),
      metadata: z.record(z.any()).optional(),
    }),
  ),
});

export async function PATCH(
  request: Request,
  { params }: { params: { lectureId: string } },
) {
  const { lectureId } = params;
  const lecture = await prisma.lecture.findUnique({ where: { id: lectureId } });
  if (!lecture) {
    return NextResponse.json({ error: 'lecture_not_found' }, { status: 404 });
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  await prisma.$transaction(
    parsed.data.uploads.map((upload) =>
      prisma.upload.update({
        where: { id: upload.uploadId },
        data: {
          status: upload.status
            ? UploadStatus[upload.status as keyof typeof UploadStatus]
            : undefined,
          sizeBytes: upload.sizeBytes,
          metadata: upload.metadata,
        },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbModule from '@quizdude/db';

const lectureCreate = vi.fn();
const lectureFindMany = vi.fn();
const lectureFindUnique = vi.fn();
const uploadCreate = vi.fn();
const uploadUpdate = vi.fn();
const jobRunFindFirst = vi.fn();
const jobRunCreate = vi.fn();
const jobRunUpdateMany = vi.fn();
const jobRunUpdate = vi.fn();
const prismaTransaction = vi.fn(async (operations: unknown[]) =>
  Promise.all(operations as Promise<unknown>[]),
);

const prismaMock = {
  lecture: {
    create: lectureCreate,
    findMany: lectureFindMany,
    findUnique: lectureFindUnique,
  },
  upload: {
    create: uploadCreate,
    update: uploadUpdate,
  },
  jobRun: {
    findFirst: jobRunFindFirst,
    create: jobRunCreate,
    updateMany: jobRunUpdateMany,
    update: jobRunUpdate,
  },
  $transaction: prismaTransaction,
};

const generateLectureUploadTargets = vi.fn();

vi.mock('../../blobStorage', () => ({
  generateLectureUploadTargets,
}));

vi.mock('@quizdude/db', async () => {
  const actual = (await vi.importActual('@quizdude/db')) as typeof DbModule;
  return {
    ...actual,
    prisma: prismaMock,
  };
});

describe('lectureService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.DATABASE_URL = 'postgres://example.com/db';
    process.env.BLOB_READ_WRITE_TOKEN = 'token';
    process.env.BLOB_PUBLIC_BASE_URL = 'https://blob.example.com';
    process.env.ENABLE_AUDIO_PIPELINE = 'true';
  });

  it('creates lecture and upload targets', async () => {
    lectureCreate.mockResolvedValue({
      id: 'lec-1',
      title: 'Test lecture',
      description: null,
      language: 'ko',
      modality: 'pdf_only',
      audioPipelineEnabled: true,
    });
    generateLectureUploadTargets.mockResolvedValue([
      {
        id: 'lec-1/pdf/file.pdf',
        kind: 'pdf',
        token: 'upload-token',
        url: 'https://blob.example.com/lec-1/pdf/file.pdf',
        pathname: 'lec-1/pdf/file.pdf',
        contentType: 'application/pdf',
      },
    ]);
    uploadCreate.mockResolvedValue({ id: 'upload-1' });

    const module = await import('../lectureService');
    const result = await module.createLecture({
      title: 'Test lecture',
      description: 'desc',
      language: 'ko',
      modality: 'pdf_only',
      audioPipelineRequested: true,
      uploads: [
        {
          kind: 'pdf',
          contentType: 'application/pdf',
          filename: 'file.pdf',
        },
      ],
    });

    expect(lectureCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Test lecture',
        audioPipelineEnabled: true,
      }),
    });
    expect(generateLectureUploadTargets).toHaveBeenCalledWith({
      lectureId: 'lec-1',
      objects: [
        {
          kind: 'pdf',
          contentType: 'application/pdf',
          filename: 'file.pdf',
        },
      ],
    });
    expect(prismaTransaction).toHaveBeenCalled();
    expect(result).toMatchObject({
      lectureId: 'lec-1',
      audioPipelineEnabled: true,
      uploads: expect.arrayContaining([
        expect.objectContaining({ id: 'upload-1', blobKey: 'lec-1/pdf/file.pdf' }),
      ]),
    });
  });

  it('prevents duplicate summarize jobs when force flag is false', async () => {
    lectureFindUnique.mockResolvedValue({ id: 'lec-1' });
    jobRunFindFirst.mockResolvedValue({ id: 'job-1' });

    const module = await import('../lectureService');

    await expect(module.triggerSummarize('lec-1', { force: false })).rejects.toMatchObject({
      status: 409,
      code: 'job_exists',
    });
  });

  it('queues transcription job when audio pipeline enabled', async () => {
    lectureFindUnique.mockResolvedValue({
      id: 'lec-1',
      audioPipelineEnabled: true,
      uploads: [{ id: 'up-a', type: 'AUDIO', status: 'READY' }],
    });
    jobRunFindFirst.mockResolvedValue(null);
    jobRunCreate.mockResolvedValue({ id: 'job-99' });

    const module = await import('../lectureService');
    const result = await module.triggerTranscription('lec-1', {});

    expect(jobRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: expect.any(String) }),
      }),
    );
    expect(result).toEqual({ jobId: 'job-99' });
  });
});

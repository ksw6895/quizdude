import pRetry, { AbortError } from 'p-retry';
import { setTimeout as sleep } from 'node:timers/promises';
import { TextEncoder } from 'node:util';
import {
  prisma,
  JobStatus,
  JobType,
  UploadType,
  UploadStatus,
  type JobRun,
  Prisma,
} from '@quizdude/db';
import {
  GeminiApiError,
  GeminiClient,
  GeminiModelUnavailableError,
  assertValidQuizSet,
  buildFilePart,
  buildSystemInstruction,
  buildTextPart,
  buildUserContent,
  getGeminiModel,
  isAudioPipelineEnabled,
  lectureSummaryJsonSchema,
  lectureSummarySchema,
  quizSetJsonSchema,
  type LectureSummary,
  type QuizSet,
} from '@quizdude/shared';
import { z } from 'zod';

import { downloadUpload } from './artifacts.js';

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 5000);
const MAX_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS ?? 3);

const transcribePayloadSchema = z.object({
  uploadId: z.string(),
  transcriptText: z.string().optional(),
  diarization: z.any().optional(),
  language: z.string().optional(),
  durationSeconds: z.number().optional(),
});

const summarizerPayloadSchema = z.object({
  lectureId: z.string(),
  pdfUploadId: z.string().optional(),
  transcriptUploadId: z.string().optional(),
});

const quizPayloadSchema = z.object({
  lectureId: z.string(),
});

const summarizerSystemPrompt = [
  'You are Quizdude Summarizer, a specialist at converting lecture artifacts into structured JSON.',
  'Follow the LectureSummary schema exactly. Do not add or remove fields.',
  'Cite slide pages in meta.source.pages when the PDF provides page numbers. Use [] when unknown.',
  'Populate timestamps for audio transcripts when available; otherwise return an empty array.',
  'Produce 4-6 highlights, 3-5 memorization mnemonics, and 3-6 core concepts.',
  'If the lecture language is ko, write textual fields in Korean; otherwise match the provided language.',
  'Return valid JSON only—no markdown, comments, or prose.',
].join('\n');

const quizGeneratorSystemPrompt = [
  'You are Quizdude Quizmaster. Generate a 20-question multiple-choice quiz from a lecture summary.',
  'Use the QuizSet schema exactly: four unique options per question, answer index 0-3, rationale explaining correctness.',
  'Balance difficulty across easy/medium/hard using summary insights and quiz seeds when present.',
  'Use pdfPages and timestamps in sourceRef when information exists, otherwise omit those arrays.',
  'Return strictly valid JSON, no markdown or commentary.',
].join('\n');

class TemporaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemporaryError';
  }
}

function createGeminiClient(): GeminiClient {
  try {
    return new GeminiClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize Gemini client';
    throw new AbortError(message);
  }
}

function mapGeminiError(error: unknown): never {
  if (error instanceof GeminiModelUnavailableError) {
    console.error('Gemini model unavailable', error.details);
    throw new AbortError(error.message);
  }
  if (error instanceof GeminiApiError) {
    console.error('Gemini API error', {
      status: error.status,
      details: error.details,
    });
    if (!error.status || error.status >= 500) {
      throw new TemporaryError(error.message);
    }
    throw new AbortError(error.message);
  }
  throw error;
}

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

async function processSummarizeJob(job: JobRun) {
  const payload = summarizerPayloadSchema.parse(job.payload ?? { lectureId: job.lectureId });
  const lecture = await prisma.lecture.findUnique({
    where: { id: job.lectureId },
    include: { uploads: true, transcripts: true },
  });

  if (!lecture) {
    throw new AbortError(`Lecture ${job.lectureId} not found`);
  }

  const pdfUpload = payload.pdfUploadId
    ? lecture.uploads.find(
        (upload) => upload.id === payload.pdfUploadId && upload.type === UploadType.PDF,
      )
    : lecture.uploads.find((upload) => upload.type === UploadType.PDF);

  if (pdfUpload && pdfUpload.status !== UploadStatus.READY) {
    throw new TemporaryError('PDF upload is not marked READY yet.');
  }

  const transcriptUpload = payload.transcriptUploadId
    ? lecture.uploads.find(
        (upload) =>
          upload.id === payload.transcriptUploadId && upload.type === UploadType.TRANSCRIPT,
      )
    : lecture.uploads.find(
        (upload) => upload.type === UploadType.TRANSCRIPT && upload.status === UploadStatus.READY,
      );

  if (transcriptUpload && transcriptUpload.status !== UploadStatus.READY) {
    throw new TemporaryError('Transcript upload is still processing.');
  }

  const transcriptRecord = lecture.transcripts.find(
    (transcript) => transcript.status === JobStatus.SUCCEEDED && Boolean(transcript.text),
  );

  if (!pdfUpload && !transcriptUpload && !transcriptRecord) {
    throw new TemporaryError(
      'No lecture artifacts (PDF or transcript) are ready for summarization.',
    );
  }

  const gemini = createGeminiClient();
  const model = getGeminiModel();

  const sourceParts: ReturnType<typeof buildTextPart>[] = [];
  const inputFiles: Record<string, unknown> = {
    pdfUploadId: pdfUpload?.id ?? null,
    transcriptUploadId: transcriptUpload?.id ?? null,
    transcriptRecordId: transcriptRecord?.id ?? null,
  };

  let pdfFileRef: { uri: string; mimeType: string; name: string } | null = null;
  if (pdfUpload) {
    let pdfAsset;
    try {
      pdfAsset = await downloadUpload(pdfUpload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF blob not available yet';
      throw new TemporaryError(`Unable to download PDF blob: ${message}`);
    }

    try {
      const uploaded = await gemini.uploadFile({
        data: pdfAsset.data,
        mimeType: pdfAsset.mimeType,
        displayName: pdfAsset.displayName,
        sizeBytes: pdfAsset.sizeBytes,
      });
      pdfFileRef = { uri: uploaded.uri, mimeType: uploaded.mimeType, name: uploaded.name };
      sourceParts.push(buildFilePart(uploaded));
      inputFiles.pdfGeminiFile = pdfFileRef;
    } catch (error) {
      mapGeminiError(error);
    }
  }

  let transcriptFileRef: { uri: string; mimeType: string; name: string } | null = null;
  if (transcriptUpload) {
    let transcriptAsset;
    try {
      transcriptAsset = await downloadUpload(transcriptUpload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcript blob not available yet';
      throw new TemporaryError(`Unable to download transcript blob: ${message}`);
    }

    try {
      const uploaded = await gemini.uploadFile({
        data: transcriptAsset.data,
        mimeType: transcriptAsset.mimeType ?? 'text/plain',
        displayName: transcriptAsset.displayName,
        sizeBytes: transcriptAsset.sizeBytes,
      });
      transcriptFileRef = { uri: uploaded.uri, mimeType: uploaded.mimeType, name: uploaded.name };
      sourceParts.push(buildFilePart(uploaded));
      inputFiles.transcriptGeminiFile = transcriptFileRef;
    } catch (error) {
      mapGeminiError(error);
    }
  } else if (transcriptRecord) {
    if (!transcriptRecord.text) {
      throw new TemporaryError('Transcript text not yet available.');
    }
    try {
      const encoder = new TextEncoder();
      const transcriptBytes = encoder.encode(transcriptRecord.text);
      const uploaded = await gemini.uploadFile({
        data: transcriptBytes,
        mimeType: 'text/plain; charset=utf-8',
        displayName: `lecture-${lecture.id}-transcript.txt`,
        sizeBytes: transcriptBytes.byteLength,
      });
      transcriptFileRef = { uri: uploaded.uri, mimeType: uploaded.mimeType, name: uploaded.name };
      sourceParts.push(buildFilePart(uploaded));
    } catch (error) {
      mapGeminiError(error);
    }
  }

  inputFiles.pdfGeminiFile = pdfFileRef ?? null;
  inputFiles.transcriptGeminiFile = transcriptFileRef ?? null;

  const instructionLines = [
    `Lecture ID: ${lecture.id}`,
    `Title: ${lecture.title}`,
    `Language: ${lecture.language}`,
    `Modality: ${lecture.modality}`,
    'Generate a LectureSummary JSON payload using the attached sources. ' +
      'Populate meta.source.pdfFileId and transcriptFileId with the Gemini file URIs provided.',
    'If a source is missing, use null for its file ID and [] for any unavailable citations.',
  ];

  const contents = [buildUserContent([buildTextPart(instructionLines.join('\n')), ...sourceParts])];

  let response;
  try {
    response = await gemini.generateContent<LectureSummary>({
      model,
      contents,
      systemInstruction: buildSystemInstruction(summarizerSystemPrompt),
      responseSchema: lectureSummaryJsonSchema,
    });
  } catch (error) {
    mapGeminiError(error);
  }

  if (!response) {
    throw new TemporaryError('Gemini summarization returned no response.');
  }

  const structured = response.parsed ?? {};
  const summaryPayload = lectureSummarySchema.parse({
    ...structured,
    meta: {
      ...(structured.meta ?? {}),
      lectureId: lecture.id,
      title: lecture.title,
      language: structured.meta?.language ?? lecture.language,
      source: {
        ...(structured.meta?.source ?? {}),
        pdfFileId: pdfFileRef?.uri ?? null,
        transcriptFileId: transcriptFileRef?.uri ?? null,
      },
    },
  });

  const summary = await prisma.summary.create({
    data: {
      lectureId: lecture.id,
      payload: summaryPayload as Prisma.InputJsonValue,
      rawResponse: response.rawResponse
        ? (response.rawResponse as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      model: response.model,
      inputFiles: inputFiles as Prisma.InputJsonValue,
    },
  });

  return { summaryId: summary.id, model: summary.model };
}

async function processQuizJob(job: JobRun) {
  const payload = quizPayloadSchema.parse(job.payload ?? { lectureId: job.lectureId });
  const lecture = await prisma.lecture.findUnique({
    where: { id: payload.lectureId },
    include: {
      summaries: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!lecture) {
    throw new AbortError(`Lecture ${payload.lectureId} not found`);
  }

  const summary = lecture.summaries[0];
  if (!summary) {
    throw new TemporaryError('Summary not available for quiz generation.');
  }

  const summaryPayload = lectureSummarySchema.parse(summary.payload);

  const gemini = createGeminiClient();
  const model = getGeminiModel();

  const summaryJson = JSON.stringify(summaryPayload);
  const summaryBytes = new TextEncoder().encode(summaryJson);

  let summaryFile;
  try {
    summaryFile = await gemini.uploadFile({
      data: summaryBytes,
      mimeType: 'application/json',
      displayName: `lecture-${payload.lectureId}-summary.json`,
      sizeBytes: summaryBytes.byteLength,
    });
  } catch (error) {
    mapGeminiError(error);
  }

  if (!summaryFile) {
    throw new TemporaryError('Failed to stage summary artifact for quiz generation.');
  }

  const quizSeedNote = summaryPayload.quizSeeds?.length
    ? `Quiz seeds to incorporate: ${JSON.stringify(summaryPayload.quizSeeds)}`
    : 'No quiz seeds were provided; ensure coverage across major concepts.';

  const instructionLines = [
    `Lecture ID: ${payload.lectureId}`,
    `Title: ${lecture.title}`,
    `Language: ${lecture.language}`,
    'Generate a QuizSet JSON with exactly 20 questions and four unique options each.',
    'Ensure the lectureId field matches the provided Lecture ID.',
    'For each question, provide a rationale and cite pages or timestamps when present in the summary.',
    quizSeedNote,
  ];

  const parts = [buildTextPart(instructionLines.join('\n'))];

  let response;
  try {
    response = await gemini.generateContent<QuizSet>({
      model,
      contents: [buildUserContent([...parts, buildFilePart(summaryFile)])],
      systemInstruction: buildSystemInstruction(quizGeneratorSystemPrompt),
      responseSchema: quizSetJsonSchema,
    });
  } catch (error) {
    mapGeminiError(error);
  }

  if (!response) {
    throw new TemporaryError('Gemini quiz generation returned no response.');
  }

  const rawQuiz = {
    ...(response.parsed as Record<string, unknown>),
    lectureId: payload.lectureId,
  };

  const quizPayload = assertValidQuizSet(rawQuiz);

  const quiz = await prisma.quiz.create({
    data: {
      lectureId: payload.lectureId,
      payload: quizPayload as Prisma.InputJsonValue,
      rawResponse: response.rawResponse
        ? (response.rawResponse as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      model: response.model,
      inputFiles: {
        summaryId: summary.id,
        summaryGeminiFile: {
          uri: summaryFile.uri,
          mimeType: summaryFile.mimeType,
          name: summaryFile.name,
        },
      } as Prisma.InputJsonValue,
      summaryId: summary.id,
    },
  });

  return { quizId: quiz.id, model: quiz.model };
}

async function processTranscriptionJob(job: JobRun) {
  if (!isAudioPipelineEnabled()) {
    throw new AbortError('Audio pipeline disabled at runtime');
  }

  const payload = transcribePayloadSchema.parse(job.payload);

  if (!payload.transcriptText) {
    throw new TemporaryError('Transcript text not yet available from ElevenLabs webhook.');
  }

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

  return { transcriptId: transcript.id };
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

async function processJob(job: JobRun) {
  try {
    let result: unknown;

    if (job.type === JobType.SUMMARIZE) {
      result = await pRetry(() => processSummarizeJob(job), { retries: 0 });
    } else if (job.type === JobType.QUIZ) {
      result = await pRetry(() => processQuizJob(job), { retries: 0 });
    } else if (job.type === JobType.TRANSCRIBE) {
      result = await pRetry(() => processTranscriptionJob(job), { retries: 2 });
    } else {
      throw new AbortError(`Unsupported job type: ${job.type}`);
    }

    await completeJob(job.id, {
      status: JobStatus.SUCCEEDED,
      completedAt: new Date(),
      result: result == null ? Prisma.JsonNull : (result as Prisma.InputJsonValue),
      lastError: null,
    });
  } catch (error) {
    const attempts = job.attempts;
    const finalAttempt = attempts >= MAX_ATTEMPTS || error instanceof AbortError;
    const delayMs = Math.min(600000, 2 ** attempts * 1000);

    await completeJob(job.id, {
      status: finalAttempt ? JobStatus.NEEDS_ATTENTION : JobStatus.PENDING,
      scheduledAt: finalAttempt ? job.scheduledAt : new Date(Date.now() + delayMs),
      lastError: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function workerLoop() {
  while (true) {
    const job = await claimNextJob();
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    await processJob(job);
  }
}

workerLoop().catch((error) => {
  console.error('Worker encountered unrecoverable error', error);
  process.exit(1);
});

import { TextEncoder } from 'node:util';

import { prisma, Prisma } from '@quizdude/db';
import type { JobRun } from '@quizdude/db';
import {
  assertValidQuizSet,
  buildFilePart,
  buildSystemInstruction,
  buildTextPart,
  buildUserContent,
  getGeminiModel,
  lectureSummarySchema,
  quizSetJsonSchema,
} from '@quizdude/shared';
import type { QuizSet } from '@quizdude/shared';
import { z } from 'zod';

import { TemporaryError } from '../errors.js';
import { createGeminiClient, mapGeminiError, shouldEnforceGeminiSchema } from '../gemini.js';
import type { Logger } from '../logger.js';

const quizGeneratorSystemPrompt = [
  'You are Quizdude Quizmaster. Generate a 20-question multiple-choice quiz from a lecture summary.',
  'Use the QuizSet schema exactly: four unique options per question, answer index 0-3, rationale explaining correctness.',
  'Balance difficulty across easy/medium/hard using summary insights and quiz seeds when present.',
  'Use pdfPages and timestamps in sourceRef when information exists, otherwise omit those arrays.',
  'Return strictly valid JSON, no markdown or commentary.',
].join('\n');

const quizPayloadSchema = z.object({
  lectureId: z.string(),
});

export async function runQuizJob(job: JobRun, logger: Logger) {
  const payload = quizPayloadSchema.parse(job.payload ?? { lectureId: job.lectureId });

  logger.info('quiz:start', { jobId: job.id, lectureId: payload.lectureId });

  const lecture = await prisma.lecture.findUnique({
    where: { id: payload.lectureId },
    include: {
      summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!lecture) {
    throw new TemporaryError(`Lecture ${payload.lectureId} not found`);
  }

  const summary = lecture.summaries[0];
  if (!summary) {
    throw new TemporaryError('Summary not available for quiz generation.');
  }

  const summaryPayload = lectureSummarySchema.parse(summary.payload);

  const gemini = createGeminiClient();
  const model = getGeminiModel();
  const enforceSchema = shouldEnforceGeminiSchema();

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
    logger.info('quiz:summary-uploaded', { jobId: job.id, lectureId: payload.lectureId });
  } catch (error) {
    mapGeminiError(error);
  }

  if (!summaryFile) {
    throw new TemporaryError('Failed to stage summary artifact for quiz generation.');
  }

  const quizSeedNote = summaryPayload.quizSeeds?.length
    ? `Quiz seeds to incorporate: ${JSON.stringify(summaryPayload.quizSeeds)}`
    : 'No quiz seeds were provided; ensure coverage across major concepts.';

  const parts = [
    buildTextPart(
      [
        `Lecture ID: ${payload.lectureId}`,
        `Title: ${lecture.title}`,
        `Language: ${lecture.language}`,
        'Generate a QuizSet JSON with exactly 20 questions and four unique options each.',
        'Ensure the lectureId field matches the provided Lecture ID.',
        'For each question, provide a rationale and cite pages or timestamps when present in the summary.',
        quizSeedNote,
      ].join('\n'),
    ),
  ];

  if (!enforceSchema) {
    logger.warn('quiz:response-schema-disabled', {
      jobId: job.id,
      lectureId: payload.lectureId,
    });
  }

  let response;
  try {
    const requestOptions = {
      model,
      contents: [buildUserContent([...parts, buildFilePart(summaryFile)])],
      systemInstruction: buildSystemInstruction(quizGeneratorSystemPrompt),
      ...(enforceSchema ? { responseSchema: quizSetJsonSchema } : {}),
    };
    response = await gemini.generateContent<QuizSet>(requestOptions);
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

  logger.info('quiz:completed', {
    jobId: job.id,
    lectureId: payload.lectureId,
    quizId: quiz.id,
    model: quiz.model,
  });

  return { quizId: quiz.id, model: quiz.model };
}

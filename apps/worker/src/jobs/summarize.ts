import { TextEncoder } from 'node:util';

import { prisma, JobStatus, UploadStatus, UploadType, Prisma } from '@quizdude/db';
import type { JobRun } from '@quizdude/db';
import {
  buildFilePart,
  buildSystemInstruction,
  buildTextPart,
  buildUserContent,
  getGeminiModel,
  lectureSummaryJsonSchema,
  lectureSummarySchema,
} from '@quizdude/shared';
import type { LectureSummary } from '@quizdude/shared';
import { z } from 'zod';

import { downloadUpload } from '../artifacts.js';
import { TemporaryError } from '../errors.js';
import { createGeminiClient, mapGeminiError } from '../gemini.js';
import type { Logger } from '../logger.js';

const summarizerSystemPrompt = [
  'You are Quizdude Summarizer, a specialist at converting lecture artifacts into structured JSON.',
  'Follow the LectureSummary schema exactly. Do not add or remove fields.',
  'Cite slide pages in meta.source.pages when the PDF provides page numbers. Use [] when unknown.',
  'Populate timestamps for audio transcripts when available; otherwise return an empty array.',
  'Produce 4-6 highlights, 3-5 memorization mnemonics, and 3-6 core concepts.',
  'If the lecture language is ko, write textual fields in Korean; otherwise match the provided language.',
  'Return valid JSON only—no markdown, comments, or prose.',
].join('\n');

const summarizerPayloadSchema = z.object({
  lectureId: z.string(),
  pdfUploadId: z.string().optional(),
  transcriptUploadId: z.string().optional(),
});

const summarizerInstructionHeader = (
  lectureId: string,
  title: string,
  language: string,
  modality: string,
) =>
  [
    `Lecture ID: ${lectureId}`,
    `Title: ${title}`,
    `Language: ${language}`,
    `Modality: ${modality}`,
    'Generate a LectureSummary JSON payload using the attached sources. ' +
      'Populate meta.source.pdfFileId and transcriptFileId with the Gemini file URIs provided.',
    'If a source is missing, use null for its file ID and [] for any unavailable citations.',
  ].join('\n');

export async function runSummarizeJob(job: JobRun, logger: Logger) {
  const payload = summarizerPayloadSchema.parse(job.payload ?? { lectureId: job.lectureId });

  logger.info('summarize:start', { jobId: job.id, lectureId: job.lectureId });

  const lecture = await prisma.lecture.findUnique({
    where: { id: job.lectureId },
    include: { uploads: true, transcripts: true },
  });

  if (!lecture) {
    throw new TemporaryError(`Lecture ${job.lectureId} not found`);
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
      logger.info('summarize:pdf-uploaded', { jobId: job.id, lectureId: job.lectureId });
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
      logger.info('summarize:transcript-uploaded', { jobId: job.id, lectureId: job.lectureId });
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
      logger.info('summarize:transcript-from-record', { jobId: job.id, lectureId: job.lectureId });
    } catch (error) {
      mapGeminiError(error);
    }
  }

  inputFiles.pdfGeminiFile = pdfFileRef ?? null;
  inputFiles.transcriptGeminiFile = transcriptFileRef ?? null;

  const contents = [
    buildUserContent([
      buildTextPart(
        summarizerInstructionHeader(lecture.id, lecture.title, lecture.language, lecture.modality),
      ),
      ...sourceParts,
    ]),
  ];

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

  logger.info('summarize:completed', {
    jobId: job.id,
    lectureId: job.lectureId,
    summaryId: summary.id,
    model: summary.model,
  });

  return { summaryId: summary.id, model: summary.model };
}

import { z } from 'zod';

export const lectureHighlightSchema = z.object({
  point: z.string(),
  why: z.string(),
  sourceMap: z.object({
    pdfPages: z.array(z.number().int().nonnegative()).default([]),
    timestamps: z
      .array(z.string().regex(/^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/))
      .default([]),
  }),
});

export const lectureMemorizationSchema = z.object({
  fact: z.string(),
  mnemonic: z.string(),
});

export const lectureConceptSchema = z.object({
  concept: z.string(),
  explanation: z.string(),
  relatedFigures: z.array(z.string()).default([]),
});

export const lectureQuizSeedSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  pitfalls: z.array(z.string()).default([]),
});

export const lectureSummarySchema = z.object({
  meta: z.object({
    lectureId: z.string(),
    title: z.string(),
    language: z.string().default('ko'),
    source: z.object({
      pdfFileId: z.string().nullable().optional(),
      transcriptFileId: z.string().nullable().optional(),
      pages: z.array(z.number().int().positive()).nullable().optional(),
    }),
  }),
  highlights: z.array(lectureHighlightSchema),
  memorization: z.array(lectureMemorizationSchema),
  concepts: z.array(lectureConceptSchema),
  quizSeeds: z.array(lectureQuizSeedSchema).default([]),
});

export type LectureSummary = z.infer<typeof lectureSummarySchema>;

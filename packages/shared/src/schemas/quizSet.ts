import { z } from 'zod';

export const quizOptionSchema = z.string().min(1);

export const quizItemSchema = z
  .object({
    qid: z.string(),
    stem: z.string().min(8),
    options: z.array(quizOptionSchema).length(4),
    answer: z.number().int().min(0).max(3),
    rationale: z.string(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    tags: z.array(z.string()),
    sourceRef: z.object({
      pdfPages: z.array(z.number().int().positive()).optional(),
      timestamps: z
        .array(z.string().regex(/^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/))
        .optional(),
    }),
  })
  .superRefine((item, ctx) => {
    const optionSet = new Set(item.options.map((option) => option.trim()));
    if (optionSet.size !== item.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'All options must be unique',
        path: ['options'],
      });
    }
    if (!item.options[item.answer]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Answer index must reference an existing option',
        path: ['answer'],
      });
    }
  });

export const quizSetSchema = z.object({
  lectureId: z.string(),
  items: z
    .array(quizItemSchema)
    .length(20, 'Quiz set must contain exactly 20 items'),
});

export type QuizSet = z.infer<typeof quizSetSchema>;

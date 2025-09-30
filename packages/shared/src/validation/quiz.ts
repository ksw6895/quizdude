import { quizSetSchema, type QuizSet } from '../schemas/quizSet.js';

export class QuizValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'QuizValidationError';
  }
}

export function assertValidQuizSet(payload: unknown): QuizSet {
  const result = quizSetSchema.safeParse(payload);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new QuizValidationError(`Invalid QuizSet payload:\n${formatted}`);
  }
  return result.data;
}

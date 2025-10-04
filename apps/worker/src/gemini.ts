import { AbortError } from 'p-retry';

import { GeminiApiError, GeminiClient, GeminiModelUnavailableError } from '@quizdude/shared';

import { TemporaryError } from './errors.js';

export function createGeminiClient(): GeminiClient {
  try {
    return new GeminiClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize Gemini client';
    throw new AbortError(message);
  }
}

export function mapGeminiError(error: unknown): never {
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

export interface GeminiConfig {
  apiKey: string;
  model: string;
  apiBaseUrl: string;
  uploadBaseUrl: string;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
const DEFAULT_API_BASE = process.env.GEMINI_API_BASE_URL ?? 'https://generativelanguage.googleapis.com';

export const GEMINI_MAX_PDF_BYTES = 50 * 1024 * 1024; // 50MB hard limit per guideline §2
export const GEMINI_MAX_DEFAULT_BYTES = 20 * 1024 * 1024; // 20MB recommended request threshold

export function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }

  const uploadBaseUrl = `${DEFAULT_API_BASE.replace(/\/$/, '')}/upload`;

  return {
    apiKey,
    model: DEFAULT_MODEL,
    apiBaseUrl: DEFAULT_API_BASE.replace(/\/$/, ''),
    uploadBaseUrl,
  };
}

export function getGeminiModel(): string {
  return DEFAULT_MODEL;
}

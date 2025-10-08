import type { JsonSchema } from '../schemas/jsonSchemas.js';

export interface GeminiFileUploadArgs {
  data: ArrayBuffer | Uint8Array;
  mimeType: string;
  displayName: string;
  sizeBytes?: number;
  maxBytes?: number;
}

export interface GeminiUploadedFile {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

export interface GeminiFileReference {
  mimeType: string;
  fileUri: string;
  displayName?: string;
}

export interface GeminiContentPart {
  text?: string;
  fileData?: GeminiFileReference;
}

export interface GeminiContent {
  role: 'user' | 'system' | 'model';
  parts: GeminiContentPart[];
}

export interface GenerateContentOptions {
  model: string;
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  responseSchema?: JsonSchema;
  responseMimeType?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
}

export interface GenerateContentResult<T = unknown> {
  rawResponse: unknown;
  parsed: T;
  model: string;
  safetyRatings?: unknown;
}

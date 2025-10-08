import {
  GEMINI_MAX_DEFAULT_BYTES,
  GEMINI_MAX_PDF_BYTES,
  getGeminiConfig,
} from '../config/gemini.js';
import type { JsonSchema } from '../schemas/jsonSchemas.js';
import { GeminiApiError, GeminiModelUnavailableError } from './errors.js';
import type {
  GeminiContent,
  GeminiFileUploadArgs,
  GeminiUploadedFile,
  GenerateContentOptions,
  GenerateContentResult,
} from './types.js';

export interface GeminiClientOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  uploadBaseUrl?: string;
}

const PDF_MIME_TYPES = new Set(['application/pdf']);

export class GeminiClient {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly uploadBaseUrl: string;
  private readonly availableModels = new Set<string>();

  constructor(options?: GeminiClientOptions) {
    const config = getGeminiConfig();
    this.apiKey = options?.apiKey ?? config.apiKey;
    this.apiBaseUrl = options?.apiBaseUrl ?? config.apiBaseUrl;
    this.uploadBaseUrl = options?.uploadBaseUrl ?? config.uploadBaseUrl;
  }

  public async ensureModelAvailable(model: string): Promise<void> {
    if (this.availableModels.has(model)) {
      return;
    }
    const url = `${this.apiBaseUrl}/v1beta/models/${encodeURIComponent(model)}?key=${this.apiKey}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      const details = await response.json().catch(() => ({ statusText: response.statusText }));
      throw new GeminiModelUnavailableError(model, response.status, details);
    }
    this.availableModels.add(model);
  }

  public async uploadFile(args: GeminiFileUploadArgs): Promise<GeminiUploadedFile> {
    const bytes = args.data instanceof Uint8Array ? args.data : new Uint8Array(args.data);
    const sizeBytes = args.sizeBytes ?? bytes.byteLength;
    const maxBytes =
      args.maxBytes ??
      (PDF_MIME_TYPES.has(args.mimeType) ? GEMINI_MAX_PDF_BYTES : GEMINI_MAX_DEFAULT_BYTES);

    if (sizeBytes > maxBytes) {
      throw new GeminiApiError(
        `File ${args.displayName} exceeds Gemini limit (${sizeBytes} bytes > ${maxBytes}).`,
        {
          details: {
            sizeBytes,
            maxBytes,
            mimeType: args.mimeType,
          },
        },
      );
    }

    const metadata = {
      file: {
        display_name: args.displayName,
        mime_type: args.mimeType,
      },
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: args.mimeType }),
      args.displayName,
    );

    const url = `${this.uploadBaseUrl}/v1beta/files?uploadType=multipart&key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      body: form,
    });

    const payload = await response.json().catch(() => ({ statusText: response.statusText }));

    if (!response.ok) {
      throw new GeminiApiError('Failed to upload file to Gemini', {
        status: response.status,
        details: payload,
      });
    }

    const file = (payload.file ?? payload) as Record<string, unknown>;

    const name =
      typeof file.name === 'string'
        ? file.name
        : typeof payload.name === 'string'
          ? payload.name
          : '';
    const uri = typeof file.uri === 'string' ? file.uri : name;
    const mimeType = typeof file.mimeType === 'string' ? file.mimeType : args.mimeType;
    const reportedSize = Number(file.sizeBytes ?? payload.sizeBytes ?? sizeBytes);

    return {
      name,
      uri,
      mimeType,
      sizeBytes: Number.isFinite(reportedSize) ? reportedSize : sizeBytes,
    };
  }

  public async generateContent<T>(
    options: GenerateContentOptions,
  ): Promise<GenerateContentResult<T>> {
    const model = options.model;
    await this.ensureModelAvailable(model);

    const url = `${this.apiBaseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${this.apiKey}`;
    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.2,
      topK: options.topK ?? 32,
      topP: options.topP ?? 0.95,
      responseMimeType: options.responseMimeType ?? 'application/json',
      responseSchema: options.responseSchema as JsonSchema,
    };

    const payload: Record<string, unknown> = {
      contents: options.contents,
      generationConfig,
    };

    if (options.systemInstruction) {
      payload.systemInstruction = options.systemInstruction;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({ statusText: response.statusText }));

    if (!response.ok) {
      throw new GeminiApiError('Gemini generateContent call failed', {
        status: response.status,
        details: body,
      });
    }

    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    const firstCandidate = candidates[0];

    if (!firstCandidate) {
      throw new GeminiApiError('Gemini response missing candidates', { details: body });
    }

    if (firstCandidate.finishReason && firstCandidate.finishReason !== 'STOP') {
      throw new GeminiApiError('Gemini did not finish successfully', {
        details: firstCandidate,
      });
    }

    const parts = firstCandidate.content?.parts;
    const textPart = Array.isArray(parts)
      ? parts.find((part: Record<string, unknown>) => typeof part.text === 'string')
      : undefined;

    if (!textPart || typeof textPart.text !== 'string') {
      throw new GeminiApiError('Gemini response does not contain structured JSON text', {
        details: firstCandidate,
      });
    }

    let parsed: T;
    try {
      parsed = JSON.parse(textPart.text) as T;
    } catch (error) {
      throw new GeminiApiError('Gemini response JSON parsing failed', {
        details: {
          text: textPart.text,
          error: error instanceof Error ? error.message : error,
        },
      });
    }

    return {
      rawResponse: body,
      parsed,
      model: typeof body.model === 'string' ? body.model : model,
      safetyRatings: firstCandidate.safetyRatings,
    };
  }
}

export function buildUserContent(parts: GeminiContent['parts']): GeminiContent {
  return {
    role: 'user',
    parts,
  };
}

export function buildSystemInstruction(text: string): GeminiContent {
  return {
    role: 'system',
    parts: [{ text }],
  };
}

export function buildFilePart(file: GeminiUploadedFile) {
  return {
    fileData: {
      fileUri: file.uri ?? file.name,
      mimeType: file.mimeType,
    },
  } as GeminiContent['parts'][number];
}

export function buildTextPart(text: string) {
  return { text } as GeminiContent['parts'][number];
}

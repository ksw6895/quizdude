export class GeminiApiError extends Error {
  public readonly status?: number;
  public readonly details?: unknown;

  constructor(message: string, options?: { status?: number; details?: unknown }) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = options?.status;
    this.details = options?.details;
  }
}

export class GeminiModelUnavailableError extends GeminiApiError {
  constructor(model: string, status?: number, details?: unknown) {
    super(`Gemini model "${model}" is unavailable`, { status, details });
    this.name = 'GeminiModelUnavailableError';
  }
}

export class GeminiResponseSchemaError extends Error {
  public readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'GeminiResponseSchemaError';
    this.path = path;
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options?.code ?? 'error';
    this.details = options?.details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export interface ErrorPayload {
  error: string;
  message: string;
  details?: unknown;
}

export function buildErrorPayload(
  error: ApiError | Error,
  fallbackCode = 'internal_error',
): ErrorPayload {
  if (error instanceof ApiError) {
    return {
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    error: fallbackCode,
    message: error.message || 'Internal server error',
  };
}

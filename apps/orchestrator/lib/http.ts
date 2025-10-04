import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ApiError, buildErrorPayload, isApiError } from './errors';

export interface RouteResult<T = unknown> {
  status?: number;
  headers?: Record<string, string>;
  body: T;
}

export async function handleRoute<T>(
  handler: () => Promise<RouteResult<T>>,
): Promise<NextResponse> {
  try {
    const { body, status = 200, headers } = await handler();
    return NextResponse.json(body, { status, headers });
  } catch (error) {
    if (isApiError(error)) {
      console.error('[api:error]', error.code, error.message, error.details ?? undefined);
      return NextResponse.json(buildErrorPayload(error), {
        status: error.status,
      });
    }

    if (error instanceof ZodError) {
      console.error('[api:validation]', error.flatten());
      const apiError = new ApiError(400, '잘못된 요청 본문입니다.', {
        code: 'invalid_payload',
        details: error.flatten(),
      });
      return NextResponse.json(buildErrorPayload(apiError), {
        status: apiError.status,
      });
    }

    console.error('[api:unhandled]', error);
    const fallback = new ApiError(500, '서버 내부 오류입니다.', { code: 'internal_error' });
    return NextResponse.json(buildErrorPayload(fallback), { status: fallback.status });
  }
}

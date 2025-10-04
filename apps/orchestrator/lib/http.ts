import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ApiError, buildErrorPayload, isApiError } from './errors';
import { getRuntimeConfig } from './config/env';

export interface RouteResult<T = unknown> {
  status?: number;
  headers?: Record<string, string>;
  body: T;
}

const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type, Authorization, Accept, X-Requested-With';

function mergeHeaders(
  base: Record<string, string> | undefined,
  additions: Record<string, string>,
): Record<string, string> {
  if (!base) {
    return { ...additions };
  }

  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(additions)) {
    if (key.toLowerCase() === 'vary' && merged[key]) {
      const existing = merged[key]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const incoming = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const combined = Array.from(new Set([...existing, ...incoming]));
      merged[key] = combined.join(', ');
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin) {
    return {};
  }

  const {
    cors: { allowedOrigins },
  } = getRuntimeConfig();

  if (allowedOrigins.includes('*')) {
    return {
      'Access-Control-Allow-Origin': '*',
    };
  }

  if (!allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

function buildPreflightHeaders(request: Request): Record<string, string> {
  const corsHeaders = buildCorsHeaders(request);
  const requestedHeaders = request.headers.get('access-control-request-headers');

  return mergeHeaders(corsHeaders, {
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': requestedHeaders ?? DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
  });
}

export async function handleRoute<T>(
  request: Request,
  handler: () => Promise<RouteResult<T>>,
): Promise<NextResponse> {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const { body, status = 200, headers } = await handler();
    const responseHeaders = mergeHeaders(headers, corsHeaders);
    return NextResponse.json(body, { status, headers: responseHeaders });
  } catch (error) {
    if (isApiError(error)) {
      console.error('[api:error]', error.code, error.message, error.details ?? undefined);
      return NextResponse.json(buildErrorPayload(error), {
        status: error.status,
        headers: mergeHeaders(undefined, corsHeaders),
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
        headers: mergeHeaders(undefined, corsHeaders),
      });
    }

    console.error('[api:unhandled]', error);
    const fallback = new ApiError(500, '서버 내부 오류입니다.', { code: 'internal_error' });
    return NextResponse.json(buildErrorPayload(fallback), {
      status: fallback.status,
      headers: mergeHeaders(undefined, corsHeaders),
    });
  }
}

export function handleOptions(request: Request): NextResponse {
  const headers = buildPreflightHeaders(request);
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}

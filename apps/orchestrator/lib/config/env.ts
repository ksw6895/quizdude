import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 환경 변수가 필요합니다.'),
  BLOB_READ_WRITE_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value ? value.trim() : undefined)),
  BLOB_PUBLIC_BASE_URL: z
    .string()
    .url('BLOB_PUBLIC_BASE_URL 은 URL 형식이어야 합니다.')
    .optional()
    .transform((value) => (value ? value.replace(/\/$/, '') : undefined)),
  ENABLE_AUDIO_PIPELINE: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
        : [],
    ),
});

export interface RuntimeConfig {
  databaseUrl: string;
  blob: {
    readWriteToken?: string;
    publicBaseUrl?: string;
  };
  features: {
    audioPipeline: boolean;
  };
  cors: {
    allowedOrigins: string[];
  };
}

let cachedConfig: RuntimeConfig | null = null;

function toBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.safeParse({ ...process.env });
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join(', ');
    throw new Error(`환경 변수 검증 실패: ${message}`);
  }

  cachedConfig = {
    databaseUrl: parsed.data.DATABASE_URL,
    blob: {
      readWriteToken: parsed.data.BLOB_READ_WRITE_TOKEN,
      publicBaseUrl: parsed.data.BLOB_PUBLIC_BASE_URL,
    },
    features: {
      audioPipeline: toBoolean(parsed.data.ENABLE_AUDIO_PIPELINE),
    },
    cors: {
      allowedOrigins:
        parsed.data.CORS_ALLOWED_ORIGINS && parsed.data.CORS_ALLOWED_ORIGINS.length > 0
          ? parsed.data.CORS_ALLOWED_ORIGINS
          : ['http://localhost:3000', 'https://quizdude.vercel.app'],
    },
  } satisfies RuntimeConfig;

  return cachedConfig;
}

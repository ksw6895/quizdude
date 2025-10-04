import { z } from 'zod';

const envSchema = z.object({
  JOB_POLL_INTERVAL_MS: z.string().optional(),
  JOB_MAX_ATTEMPTS: z.string().optional(),
  WORKER_CONCURRENCY: z.string().optional(),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY 환경 변수가 필요합니다.'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BLOB_PUBLIC_BASE_URL: z.string().optional(),
  ENABLE_AUDIO_PIPELINE: z.string().optional(),
  RENDER_INSTANCE_ID: z.string().optional(),
});

export interface WorkerConfig {
  pollIntervalMs: number;
  maxAttempts: number;
  concurrency: number;
  instanceId: string;
}

let cachedConfig: WorkerConfig | null = null;

function toNumber(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${label} 환경 변수는 양의 정수여야 합니다.`);
  }
  return parsed;
}

export function getWorkerConfig(): WorkerConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.safeParse({ ...process.env });
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join(', ');
    throw new Error(`Worker 환경 변수 검증 실패: ${message}`);
  }

  cachedConfig = {
    pollIntervalMs: toNumber(parsed.data.JOB_POLL_INTERVAL_MS, 5000, 'JOB_POLL_INTERVAL_MS'),
    maxAttempts: toNumber(parsed.data.JOB_MAX_ATTEMPTS, 3, 'JOB_MAX_ATTEMPTS'),
    concurrency: toNumber(parsed.data.WORKER_CONCURRENCY, 1, 'WORKER_CONCURRENCY'),
    instanceId: parsed.data.RENDER_INSTANCE_ID ?? 'local',
  } satisfies WorkerConfig;

  return cachedConfig;
}

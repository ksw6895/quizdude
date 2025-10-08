import type { LectureDetailResponse, LectureListResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL?.replace(/\/$/, '') ?? '';

function resolveUrl(path: string): string {
  if (path.startsWith('http')) {
    return path;
  }
  return `${API_BASE}${path}`;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = resolveUrl(path);
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export interface CreateLecturePayload {
  title: string;
  description?: string;
  language: string;
  modality: 'pdf_only' | 'pdf_plus_media' | 'media_only';
  audioPipelineRequested: boolean;
  uploads: Array<{
    kind: 'pdf' | 'audio' | 'video' | 'transcript';
    contentType: string;
    filename: string;
  }>;
}

export interface UpdateUploadPayload {
  uploads: Array<{
    uploadId: string;
    status?: 'REQUESTED' | 'UPLOADING' | 'READY' | 'FAILED';
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface JobTriggerPayload {
  force?: boolean;
}

export async function listLectures() {
  return apiFetch<LectureListResponse>('/api/lectures');
}

export async function getLectureDetail(lectureId: string) {
  return apiFetch<LectureDetailResponse>(`/api/lectures/${lectureId}`);
}

export interface UploadTargetResponse {
  id: string;
  kind: string;
  url: string;
  token: string;
  pathname: string;
  contentType: string;
  blobKey?: string;
}

export async function createLecture(payload: CreateLecturePayload) {
  return apiFetch<{
    lectureId: string;
    uploads: UploadTargetResponse[];
    audioPipelineEnabled: boolean;
  }>('/api/lectures', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUploadStatus(lectureId: string, payload: UpdateUploadPayload) {
  return apiFetch(`/api/lectures/${lectureId}/uploads`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function triggerSummarize(lectureId: string, payload: JobTriggerPayload = {}) {
  return apiFetch(`/api/lectures/${lectureId}/summarize`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function triggerQuiz(lectureId: string, payload: JobTriggerPayload = {}) {
  return apiFetch(`/api/lectures/${lectureId}/quiz`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function triggerTranscription(
  lectureId: string,
  payload: JobTriggerPayload & { uploadId?: string } = {},
) {
  return apiFetch(`/api/lectures/${lectureId}/transcribe`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

import type { LectureSummary, QuizSet } from '@quizdude/shared';

export interface UploadInfo {
  id: string;
  type: string;
  status: string;
  blobKey?: string;
  contentType: string;
  sizeBytes: number | null;
  metadata?: unknown;
  createdAt?: string;
  updatedAt: string;
}

export interface JobSnapshot {
  id: string;
  type: string;
  status: string;
  updatedAt: string;
  lastError: string | null;
  attempts?: number;
  scheduledAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  payload?: unknown;
  result?: unknown;
  createdAt?: string;
}

export interface LectureListItem {
  id: string;
  title: string;
  description: string | null;
  language: string;
  modality: string;
  audioPipelineEnabled: boolean;
  createdAt: string;
  uploads: UploadInfo[];
  latestSummary: {
    id: string;
    createdAt: string;
    model: string;
    meta: unknown;
  } | null;
  latestQuiz: {
    id: string;
    createdAt: string;
    model: string;
    itemCount: number | null;
  } | null;
  jobs: Record<string, JobSnapshot | null>;
}

export interface LectureListResponse {
  lectures: LectureListItem[];
}

export interface SummaryDetail {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  payload: LectureSummary;
  rawResponse: unknown;
  inputFiles: unknown;
}

export interface QuizDetail {
  id: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  payload: QuizSet;
  rawResponse: unknown;
  inputFiles: unknown;
  summaryId: string | null;
}

export interface LectureDetail {
  id: string;
  title: string;
  description: string | null;
  language: string;
  modality: string;
  audioPipelineEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  uploads: UploadInfo[];
  summaries: SummaryDetail[];
  quizzes: QuizDetail[];
  jobs: JobSnapshot[];
}

export interface LectureDetailResponse {
  lecture: LectureDetail;
}

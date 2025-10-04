'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ComponentProps, DragEvent, ElementRef, FormEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowPathIcon,
  CloudArrowUpIcon,
  DocumentMagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { put } from '@vercel/blob/client';

import {
  createLecture,
  listLectures,
  triggerQuiz,
  triggerSummarize,
  triggerTranscription,
  updateUploadStatus,
  type CreateLecturePayload,
} from '../../lib/api';
import type { LectureListItem } from '../../lib/types';
import { Card, CardHeader, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { StatusIndicator } from '../../components/ui/status-indicator';

interface SelectedFile {
  id: string;
  file: File;
  kind: 'pdf' | 'audio' | 'video' | 'transcript';
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  message?: string;
}

const POLL_INTERVAL_MS = 15000;

const fetchLectures = async () => {
  const response = await listLectures();
  return response.lectures;
};

function detectKind(file: File): SelectedFile['kind'] {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }
  if (file.type.startsWith('audio/') || file.name.toLowerCase().match(/\.(mp3|wav|m4a|flac)$/)) {
    return 'audio';
  }
  if (file.type.startsWith('video/') || file.name.toLowerCase().match(/\.(mp4|mov|avi|mkv)$/)) {
    return 'video';
  }
  return 'transcript';
}

function determineModality(files: SelectedFile[]): CreateLecturePayload['modality'] {
  const hasPdf = files.some((item) => item.kind === 'pdf');
  const hasMedia = files.some((item) => item.kind === 'audio' || item.kind === 'video');
  if (hasPdf && hasMedia) return 'pdf_plus_media';
  if (hasPdf) return 'pdf_only';
  return 'media_only';
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

const statusBadges: Record<
  string,
  { label: string; tone: ComponentProps<typeof Badge>['variant'] }
> = {
  READY: { label: '레디', tone: 'success' },
  SUCCEEDED: { label: '성공', tone: 'success' },
  PROCESSING: { label: '처리 중', tone: 'default' },
  PENDING: { label: '대기', tone: 'default' },
  UPLOADING: { label: '업로드 중', tone: 'default' },
  FAILED: { label: '실패', tone: 'danger' },
  NEEDS_ATTENTION: { label: '확인 필요', tone: 'danger' },
};

const KIND_LABELS: Record<SelectedFile['kind'], string> = {
  pdf: 'PDF',
  audio: '오디오',
  video: '비디오',
  transcript: '전사 텍스트',
};

export default function DashboardPage() {
  const {
    data: lectures,
    error,
    isLoading,
    mutate,
  } = useSWR<LectureListItem[]>('lectures', fetchLectures, {
    refreshInterval: POLL_INTERVAL_MS,
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('ko');
  const [audioPipeline, setAudioPipeline] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<ElementRef<'input'>>(null);

  const hasMedia = useMemo(
    () => selectedFiles.some((file) => file.kind === 'audio' || file.kind === 'video'),
    [selectedFiles],
  );

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    setSelectedFiles((prev) => {
      let next = [...prev];
      Array.from(files).forEach((file) => {
        const kind = detectKind(file);
        const id = crypto.randomUUID();
        if (kind === 'pdf') {
          next = next.filter((item) => item.kind !== 'pdf');
          next.push({ id, file, kind, status: 'pending' });
        } else {
          next = next.filter((item) => item.kind !== kind);
          next.push({ id, file, kind, status: 'pending' });
        }
      });
      return [...next];
    });
    setFeedback(null);
    setErrorMessage(null);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      addFiles(event.dataTransfer.files);
    },
    [addFiles],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const removeFile = useCallback((id: string) => {
    setSelectedFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setLanguage('ko');
    setAudioPipeline(false);
    setSelectedFiles([]);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFeedback(null);
      setErrorMessage(null);

      if (!title.trim()) {
        setErrorMessage('제목을 입력하세요.');
        return;
      }

      if (!selectedFiles.length) {
        setErrorMessage('업로드할 파일을 선택하거나 드래그하세요.');
        return;
      }

      try {
        setSubmitting(true);
        setSelectedFiles((prev) =>
          prev.map((file) => ({ ...file, status: 'pending', message: undefined })),
        );

        const modality = determineModality(selectedFiles);
        const payload: CreateLecturePayload = {
          title: title.trim(),
          description: description.trim() || undefined,
          language: language.trim() || 'ko',
          modality,
          audioPipelineRequested: audioPipeline && hasMedia,
          uploads: selectedFiles.map((file) => ({
            kind: file.kind,
            contentType: file.file.type || 'application/octet-stream',
            filename: file.file.name,
          })),
        };

        const response = await createLecture(payload);
        const { lectureId, uploads, audioPipelineEnabled } = response;

        for (const upload of uploads) {
          const match = selectedFiles.find((file) => file.kind === upload.kind);
          if (!match) {
            continue;
          }

          setSelectedFiles((prev) =>
            prev.map((file) =>
              file.id === match.id ? { ...file, status: 'uploading', message: undefined } : file,
            ),
          );

          await updateUploadStatus(lectureId, {
            uploads: [
              {
                uploadId: upload.id,
                status: 'UPLOADING',
              },
            ],
          });

          try {
            const result = await put(upload.pathname, match.file, {
              token: upload.token,
              access: 'public',
              contentType: match.file.type || 'application/octet-stream',
            });

            await updateUploadStatus(lectureId, {
              uploads: [
                {
                  uploadId: upload.id,
                  status: 'READY',
                  sizeBytes: match.file.size,
                  metadata: {
                    originalFilename: match.file.name,
                    blobUrl: result.url,
                  },
                },
              ],
            });

            setSelectedFiles((prev) =>
              prev.map((file) =>
                file.id === match.id
                  ? {
                      ...file,
                      status: 'uploaded',
                      message: '업로드 완료',
                    }
                  : file,
              ),
            );
          } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
            await updateUploadStatus(lectureId, {
              uploads: [
                {
                  uploadId: upload.id,
                  status: 'FAILED',
                  metadata: {
                    error: message,
                  },
                },
              ],
            });

            setSelectedFiles((prev) =>
              prev.map((file) =>
                file.id === match.id
                  ? {
                      ...file,
                      status: 'failed',
                      message,
                    }
                  : file,
              ),
            );
            throw uploadError;
          }
        }

        const pdfUploadTarget = uploads.find((item) => item.kind === 'pdf');
        const audioOrVideoUpload = uploads.find(
          (item) => item.kind === 'audio' || item.kind === 'video',
        );
        const transcriptUpload = uploads.find((item) => item.kind === 'transcript');

        if (pdfUploadTarget || transcriptUpload) {
          await triggerSummarize(lectureId);
        }

        if (audioPipeline && audioPipelineEnabled && audioOrVideoUpload) {
          await triggerTranscription(lectureId, { uploadId: audioOrVideoUpload.id });
        }

        setFeedback('강의가 생성되었습니다. 처리 현황은 아래 목록에서 확인하세요.');
        resetForm();
        mutate();
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : '강의 생성 중 오류가 발생했습니다.';
        setErrorMessage(message);
      } finally {
        setSubmitting(false);
        mutate();
      }
    },
    [title, description, language, selectedFiles, audioPipeline, hasMedia, resetForm, mutate],
  );

  const rerunSummary = useCallback(
    async (lectureId: string) => {
      try {
        await triggerSummarize(lectureId, { force: true });
        mutate();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '요약 재실행 실패');
      }
    },
    [mutate],
  );

  const rerunQuiz = useCallback(
    async (lectureId: string) => {
      try {
        await triggerQuiz(lectureId, { force: true });
        mutate();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '퀴즈 재실행 실패');
      }
    },
    [mutate],
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-white">업로드 대시보드</h1>
        <p className="max-w-2xl text-slate-300">
          PDF와 미디어 파일을 업로드하고 Gemini 기반 요약 및 퀴즈 생성을 실행합니다. Blob 업로드
          진행 상황은 실시간으로 추적되며, 잡 재실행 버튼으로 언제든지 결과를 갱신할 수 있습니다.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span className="inline-flex items-center gap-1">
            <ArrowPathIcon className="h-4 w-4" /> {POLL_INTERVAL_MS / 1000}s 마다 목록 자동 새로고침
          </span>
          <span className="inline-flex items-center gap-1">
            <DocumentMagnifyingGlassIcon className="h-4 w-4" /> 요약/퀴즈는 Gemini json schema
            validation을 통과해야 저장됩니다
          </span>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="border-slate-800/80 bg-slate-900/70">
          <CardHeader
            title="새 강의 업로드"
            description="필수 PDF와 선택적인 오디오/비디오/전사 텍스트를 등록하세요. 업로드 완료 시 요약이 자동으로 실행됩니다."
          />
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="col-span-full">
                <label className="flex flex-col gap-2 text-sm text-slate-200">
                  <span>강의 제목 *</span>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="예: 2025년 1학기 AI 개론 3주차"
                    required
                  />
                </label>
              </div>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span>강의 설명</span>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-[120px]"
                  placeholder="강의 개요, 핵심 학습 목표 등을 입력하면 후기 확인 시 도움이 됩니다."
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span>강의 언어</span>
                <Input
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder="ko"
                />
              </label>
            </div>

            <div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={clsx(
                  'group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/60 p-10 text-center transition hover:border-brand-400 hover:bg-slate-900',
                  isDragging ? 'border-brand-400 bg-slate-900/40' : '',
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <CloudArrowUpIcon className="h-12 w-12 text-brand-300" />
                <p className="mt-4 text-base font-medium text-slate-200">
                  파일을 끌어다 놓거나 클릭해서 선택하세요
                </p>
                <p className="mt-2 max-w-md text-sm text-slate-400">
                  PDF 1개와 오디오·비디오·전사 텍스트를 각각 1개씩 업로드할 수 있습니다. 동일 종류
                  파일을 다시 선택하면 최신 파일로 교체됩니다.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(event) => addFiles(event.target.files)}
                  accept=".pdf,.mp3,.wav,.m4a,.flac,.mp4,.mov,.avi,.mkv,.txt,.json"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/50 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-200">오디오 파이프라인 실행</p>
                <p className="text-xs text-slate-400">
                  오디오/비디오 파일이 있을 때만 활성화됩니다. 전사 완료 후 Gemini 요약이 해당
                  텍스트를 활용합니다.
                </p>
              </div>
              <Switch
                checked={audioPipeline && hasMedia}
                onCheckedChange={(value) => setAudioPipeline(value)}
                disabled={!hasMedia}
                className={!hasMedia ? 'cursor-not-allowed opacity-50' : undefined}
              />
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                {errorMessage}
              </div>
            )}
            {feedback && (
              <div className="rounded-xl border border-brand-400/40 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
                {feedback}
              </div>
            )}

            <CardFooter>
              <Button type="submit" loading={submitting} className="min-w-[160px]">
                강의 업로드 실행
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm} disabled={submitting}>
                입력 초기화
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="border-slate-800/80 bg-slate-900/70">
            <CardHeader title="선택한 파일" description="업로드 순서 및 상태를 확인하세요." />
            <ul className="space-y-4 text-sm text-slate-200">
              {selectedFiles.length === 0 && (
                <li className="text-slate-400">등록된 파일이 없습니다.</li>
              )}
              {selectedFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="muted">{KIND_LABELS[file.kind]}</Badge>
                      <span className="font-medium text-slate-100">{file.file.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {(file.file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    {file.message && <span className="text-xs text-slate-400">{file.message}</span>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={statusBadges[file.status.toUpperCase()]?.tone ?? 'muted'}>
                      {statusBadges[file.status.toUpperCase()]?.label ?? file.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.id)}
                      className="text-xs text-slate-400 hover:text-slate-100"
                    >
                      제거
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="border-slate-800/80 bg-slate-900/70">
            <CardHeader
              title="업로드 팁"
              description="대용량 파일 업로드 안정성을 높이기 위한 가이드입니다."
            />
            <ul className="space-y-3 text-xs text-slate-300">
              <li>
                • 브라우저 창을 새로고침하지 않은 상태에서 PDF → 미디어 → 전사 순으로 업로드하면
                안정적입니다.
              </li>
              <li>• 업로드 실패 시 파일을 다시 선택하면 같은 Blob 키로 재시도합니다.</li>
              <li>
                • Render 워커가 요약/퀴즈를 처리하는 동안 잡 상태가 PENDING → PROCESSING → SUCCEEDED
                로 변합니다.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Card className="border-slate-800/80 bg-slate-900/70">
        <CardHeader
          title="강의 목록"
          description="최근 업로드된 강의와 잡 상태를 확인하고 재실행할 수 있습니다."
        />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">강의</th>
                <th className="px-4 py-3">모달리티</th>
                <th className="px-4 py-3">요약</th>
                <th className="px-4 py-3">퀴즈</th>
                <th className="px-4 py-3">잡 상태</th>
                <th className="px-4 py-3">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>
                    데이터를 불러오는 중입니다...
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td className="px-4 py-6 text-center text-danger" colSpan={6}>
                    강의 목록을 불러오지 못했습니다.
                  </td>
                </tr>
              )}
              {lectures && lectures.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>
                    아직 업로드된 강의가 없습니다. 상단 폼에서 처음 강의를 등록해보세요.
                  </td>
                </tr>
              )}
              {lectures?.map((lecture) => (
                <tr key={lecture.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/lectures/${lecture.id}`}
                        className="text-sm font-semibold text-slate-100 hover:text-brand-200"
                      >
                        {lecture.title}
                      </Link>
                      <span className="text-xs text-slate-400">
                        생성일 {formatDate(lecture.createdAt)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant="muted">{lecture.modality}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    {lecture.latestSummary ? (
                      <div className="flex flex-col">
                        <StatusIndicator status="SUCCEEDED" label="생성됨" />
                        <span className="text-xs text-slate-400">
                          {formatDate(lecture.latestSummary.createdAt)}
                        </span>
                      </div>
                    ) : (
                      <StatusIndicator status="PENDING" label="미생성" />
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {lecture.latestQuiz ? (
                      <div className="flex flex-col">
                        <StatusIndicator
                          status="SUCCEEDED"
                          label={`${lecture.latestQuiz.itemCount ?? 0}문항`}
                        />
                        <span className="text-xs text-slate-400">
                          {formatDate(lecture.latestQuiz.createdAt)}
                        </span>
                      </div>
                    ) : (
                      <StatusIndicator status="PENDING" label="미생성" />
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1 text-xs text-slate-300">
                      {Object.entries(lecture.jobs).map(([key, job]) =>
                        job ? (
                          <div key={key} className="flex items-center justify-between gap-2">
                            <span className="uppercase text-slate-400">{key}</span>
                            <StatusIndicator status={job.status} />
                          </div>
                        ) : null,
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" asChild>
                        <Link href={`/lectures/${lecture.id}`}>상세 보기</Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => rerunSummary(lecture.id)}>
                        요약 재실행
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => rerunQuiz(lecture.id)}>
                        퀴즈 재실행
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

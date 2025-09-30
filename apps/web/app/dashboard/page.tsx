'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

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
  if (hasPdf && hasMedia) {
    return 'pdf_plus_media';
  }
  if (hasPdf) {
    return 'pdf_only';
  }
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

function statusColor(status?: string | null) {
  switch (status) {
    case 'SUCCEEDED':
    case 'READY':
      return '#16a34a';
    case 'PROCESSING':
    case 'PENDING':
    case 'UPLOADING':
      return '#2563eb';
    case 'NEEDS_ATTENTION':
    case 'FAILED':
      return '#dc2626';
    default:
      return '#6b7280';
  }
}

export default function DashboardPage() {
  const { data: lectures, error, isLoading, mutate } = useSWR<LectureListItem[]>('lectures', fetchLectures, {
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

  const hasPdf = useMemo(() => selectedFiles.some((file) => file.kind === 'pdf'), [selectedFiles]);
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
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

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
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      addFiles(event.dataTransfer.files);
    },
    [addFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
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
    async (event: React.FormEvent<HTMLFormElement>) => {
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
        setSelectedFiles((prev) => prev.map((file) => ({ ...file, status: 'pending', message: undefined })));

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
            const res = await fetch(upload.url, {
              method: 'PUT',
              headers: {
                'Content-Type': match.file.type || 'application/octet-stream',
                Authorization: `Bearer ${upload.token}`,
              },
              body: match.file,
            });

            if (!res.ok) {
              throw new Error(`Upload failed with status ${res.status}`);
            }

            await updateUploadStatus(lectureId, {
              uploads: [
                {
                  uploadId: upload.id,
                  status: 'READY',
                  sizeBytes: match.file.size,
                  metadata: {
                    originalFilename: match.file.name,
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
        const audioOrVideoUpload = uploads.find((item) => item.kind === 'audio' || item.kind === 'video');
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
    [
      title,
      description,
      language,
      selectedFiles,
      audioPipeline,
      hasMedia,
      resetForm,
      mutate,
    ],
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
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem 4rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>업로드 대시보드</h1>
        <p style={{ color: '#4b5563' }}>
          PDF와 미디어 파일을 업로드하고 Gemini 기반 요약 및 퀴즈 생성을 실행하세요.
        </p>
      </header>

      <section style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.5rem', background: '#f9fafb' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>새 강의 업로드</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>제목 *</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                placeholder="예: 2025년 1학기 AI 개론 3주차"
              />
            </label>
            <label style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>언어</span>
              <input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                placeholder="ko"
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>설명</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #d1d5db', resize: 'vertical' }}
              placeholder="강의 요약, 챕터, 강사 정보를 남기면 요약 품질에 도움이 됩니다."
            />
          </label>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              border: '2px dashed #d1d5db',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              textAlign: 'center',
              background: isDragging ? '#eef2ff' : '#fff',
              transition: 'background 0.2s ease',
            }}
          >
            <p style={{ fontWeight: 600 }}>파일을 이 영역에 드래그하세요</p>
            <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>
              PDF 1개와 영상/오디오/전사 파일을 최대 1개씩 업로드할 수 있습니다.
            </p>
            <div style={{ marginTop: '1rem' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: '#1d4ed8',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                파일 선택
                <input
                  type="file"
                  multiple
                  onChange={(event) => addFiles(event.target.files)}
                  style={{ display: 'none' }}
                  accept=".pdf,audio/*,video/*,.txt,.json"
                />
              </label>
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>선택된 파일</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedFiles.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.75rem',
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.file.name}</div>
                      <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                        {item.kind.toUpperCase()} · {(item.file.size / (1024 * 1024)).toFixed(2)} MB · {item.file.type || 'unknown'}
                      </div>
                      <div style={{ color: statusColor(item.status), fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        {item.status === 'pending' && '대기 중'}
                        {item.status === 'uploading' && '업로드 중...'}
                        {item.status === 'uploaded' && '업로드 완료'}
                        {item.status === 'failed' && `실패: ${item.message}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(item.id)}
                      disabled={submitting}
                      style={{
                        background: 'transparent',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        padding: '0.35rem 0.75rem',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasMedia && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={audioPipeline}
                onChange={(event) => setAudioPipeline(event.target.checked)}
              />
              <span style={{ fontSize: '0.95rem' }}>오디오/비디오 전사 파이프라인 실행 (ElevenLabs)</span>
            </label>
          )}

          {errorMessage && <div style={{ color: '#dc2626', fontWeight: 600 }}>{errorMessage}</div>}
          {feedback && <div style={{ color: '#15803d', fontWeight: 600 }}>{feedback}</div>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              alignSelf: 'flex-start',
              background: submitting ? '#94a3b8' : '#1d4ed8',
              color: '#fff',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.6rem 1.4rem',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '업로드 중...' : '강의 생성'}
          </button>
        </form>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>강의 현황</h2>
          <button
            type="button"
            onClick={() => mutate()}
            style={{
              background: '#111827',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.35rem 0.9rem',
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
        {isLoading && <p>데이터를 불러오는 중...</p>}
        {error && <p style={{ color: '#dc2626' }}>강의 목록을 불러올 수 없습니다.</p>}
        {lectures && lectures.length === 0 && <p style={{ color: '#6b7280' }}>등록된 강의가 없습니다.</p>}
        {lectures && lectures.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {lectures.map((lecture) => (
              <article
                key={lecture.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '1.25rem',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{lecture.title}</h3>
                  <p style={{ color: '#6b7280', margin: '0.25rem 0' }}>{lecture.description ?? '설명 없음'}</p>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    {lecture.language.toUpperCase()} · {lecture.modality} · 생성일 {formatDate(lecture.createdAt)}
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: '1 1 220px' }}>
                    <strong>업로드</strong>
                    <ul style={{ listStyle: 'none', margin: '0.35rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {lecture.uploads.map((upload) => (
                        <li key={upload.id} style={{ color: statusColor(upload.status), fontSize: '0.9rem' }}>
                          {upload.type}: {upload.status}{' '}
                          {upload.sizeBytes ? `(${(upload.sizeBytes / (1024 * 1024)).toFixed(1)} MB)` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ flex: '1 1 220px' }}>
                    <strong>요약</strong>
                    {lecture.latestSummary ? (
                      <div style={{ color: '#1f2937', fontSize: '0.95rem' }}>
                        {lecture.latestSummary.meta ? '생성됨' : '대기 중'} · 모델 {lecture.latestSummary.model}
                        <br />
                        {formatDate(lecture.latestSummary.createdAt)}
                      </div>
                    ) : (
                      <div style={{ color: '#6b7280' }}>—</div>
                    )}
                  </div>
                  <div style={{ flex: '1 1 220px' }}>
                    <strong>퀴즈</strong>
                    {lecture.latestQuiz ? (
                      <div style={{ color: '#1f2937', fontSize: '0.95rem' }}>
                        {lecture.latestQuiz.itemCount ?? 0}문항 · 모델 {lecture.latestQuiz.model}
                        <br />
                        {formatDate(lecture.latestQuiz.createdAt)}
                      </div>
                    ) : (
                      <div style={{ color: '#6b7280' }}>—</div>
                    )}
                  </div>
                  <div style={{ flex: '1 1 220px' }}>
                    <strong>잡 상태</strong>
                    <ul style={{ listStyle: 'none', margin: '0.35rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {['summarize', 'quiz', 'transcribe'].map((key) => {
                        const job = lecture.jobs[key];
                        return (
                          <li key={key} style={{ color: statusColor(job?.status), fontSize: '0.9rem' }}>
                            {key}: {job ? job.status : '—'}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => rerunSummary(lecture.id)}
                    style={{
                      background: '#1d4ed8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.45rem 0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    요약 재실행
                  </button>
                  <button
                    type="button"
                    onClick={() => rerunQuiz(lecture.id)}
                    style={{
                      background: '#9333ea',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.45rem 0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    퀴즈 재실행
                  </button>
                  <Link
                    href={`/lectures/${lecture.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      color: '#1f2937',
                    }}
                  >
                    상세 보기
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

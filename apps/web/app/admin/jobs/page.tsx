'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';

import { getLectureDetail, listLectures, triggerQuiz, triggerSummarize } from '../../../lib/api';
import type { LectureDetail, LectureListItem } from '../../../lib/types';
import type { LectureSummary, QuizSet } from '@quizdude/shared';

const REFRESH_INTERVAL_MS = 15000;

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function RawJson({ label, value }: { label: string; value: unknown }) {
  if (!value) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <strong>{label}</strong>
        <span style={{ color: '#6b7280' }}>자료 없음</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <strong>{label}</strong>
      <pre
        style={{
          background: '#0f172a',
          color: '#e2e8f0',
          borderRadius: '0.75rem',
          padding: '0.9rem',
          overflowX: 'auto',
          fontSize: '0.85rem',
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AdminJobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedLectureId = searchParams.get('lecture');

  const { data: lectures } = useSWR<LectureListItem[]>(
    'admin-lectures',
    async () => {
      const response = await listLectures();
      return response.lectures;
    },
    { refreshInterval: REFRESH_INTERVAL_MS },
  );

  const { data: lectureDetail, error: detailError, isLoading, mutate } = useSWR<LectureDetail>(
    selectedLectureId ? ['admin-lecture', selectedLectureId] : null,
    async () => {
      if (!selectedLectureId) {
        return undefined as unknown as LectureDetail;
      }
      const response = await getLectureDetail(selectedLectureId);
      return response.lecture;
    },
    { refreshInterval: REFRESH_INTERVAL_MS },
  );

  const latestSummary = useMemo(() => lectureDetail?.summaries?.[0], [lectureDetail]);
  const latestQuiz = useMemo(() => lectureDetail?.quizzes?.[0], [lectureDetail]);

  const handleSelectLecture = (id: string) => {
    router.replace(`/admin/jobs?lecture=${id}`);
  };

  const rerunSummary = async () => {
    if (!selectedLectureId) return;
    await triggerSummarize(selectedLectureId, { force: true });
    mutate();
  };

  const rerunQuiz = async () => {
    if (!selectedLectureId) return;
    await triggerQuiz(selectedLectureId, { force: true });
    mutate();
  };

  return (
    <main style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', padding: '2rem 1.5rem 4rem' }}>
      <aside style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', background: '#fff', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>강의 목록</h2>
          <Link href="/dashboard" style={{ color: '#2563eb', fontSize: '0.9rem' }}>
            대시보드
          </Link>
        </div>
        {lectures && lectures.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {lectures.map((lecture) => {
              const isActive = lecture.id === selectedLectureId;
              return (
                <li key={lecture.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectLecture(lecture.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem 0.9rem',
                      borderRadius: '0.65rem',
                      border: '1px solid',
                      borderColor: isActive ? '#1d4ed8' : '#e5e7eb',
                      background: isActive ? '#dbeafe' : '#fff',
                      color: '#1f2937',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{lecture.title}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>생성일 {formatDate(lecture.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ color: '#6b7280' }}>강의가 없습니다.</p>
        )}
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!selectedLectureId && <p style={{ color: '#6b7280' }}>좌측에서 강의를 선택하세요.</p>}
        {selectedLectureId && isLoading && <p>강의 데이터를 불러오는 중...</p>}
        {detailError && <p style={{ color: '#dc2626' }}>강의 상세 정보를 불러올 수 없습니다.</p>}

        {lectureDetail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <header style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{lectureDetail.title}</h1>
              <p style={{ color: '#4b5563' }}>{lectureDetail.description ?? '설명 없음'}</p>
              <div style={{ color: '#6b7280', fontSize: '0.95rem' }}>
                {lectureDetail.language.toUpperCase()} · {lectureDetail.modality} · 생성일 {formatDate(lectureDetail.createdAt)}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={rerunSummary}
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
                  onClick={rerunQuiz}
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
              </div>
            </header>

            <section style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>최근 요약</h2>
              {latestSummary ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    모델 {latestSummary.model} · 생성일 {formatDate(latestSummary.createdAt)} · 요약 ID {latestSummary.id}
                  </div>
                  <RawJson label="요약 JSON" value={latestSummary.payload as LectureSummary} />
                  <RawJson label="원본 응답" value={latestSummary.rawResponse} />
                  <RawJson label="입력 소스" value={latestSummary.inputFiles} />
                </div>
              ) : (
                <p style={{ color: '#6b7280' }}>요약 데이터가 없습니다.</p>
              )}
            </section>

            <section style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>최근 퀴즈</h2>
              {latestQuiz ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    모델 {latestQuiz.model} · 생성일 {formatDate(latestQuiz.createdAt)} · 퀴즈 ID {latestQuiz.id}
                  </div>
                  <RawJson label="퀴즈 JSON" value={latestQuiz.payload as QuizSet} />
                  <RawJson label="원본 응답" value={latestQuiz.rawResponse} />
                  <RawJson label="입력 소스" value={latestQuiz.inputFiles} />
                </div>
              ) : (
                <p style={{ color: '#6b7280' }}>퀴즈 데이터가 없습니다.</p>
              )}
            </section>

            <section style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', background: '#fff', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>잡 이력</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>ID</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>타입</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>상태</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>시작</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>완료</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>오류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lectureDetail.jobs.map((job) => (
                      <tr key={job.id}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '0.85rem' }}>{job.id}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>{job.type}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb', color: job.status === 'SUCCEEDED' ? '#15803d' : job.status === 'NEEDS_ATTENTION' || job.status === 'FAILED' ? '#dc2626' : '#1f2937' }}>{job.status}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>{formatDate(job.startedAt)}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>{formatDate(job.completedAt)}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}>{job.lastError ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

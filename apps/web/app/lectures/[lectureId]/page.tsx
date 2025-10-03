'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';

import { getLectureDetail, triggerQuiz, triggerSummarize } from '../../../lib/api';
import type { LectureDetail, QuizDetail, SummaryDetail } from '../../../lib/types';
import type { LectureSummary, QuizSet } from '@quizdude/shared';

const REFRESH_INTERVAL_MS = 12000;

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function SummarySection({ summary }: { summary?: SummaryDetail }) {
  if (!summary) {
    return (
      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          background: '#fff',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>요약</h2>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>생성된 요약이 없습니다.</p>
      </section>
    );
  }

  const payload = summary.payload as LectureSummary;

  return (
    <section
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>요약</h2>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          모델 {summary.model} · 생성일 {formatDate(summary.createdAt)}
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>메타 정보</h3>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              color: '#1f2937',
              fontSize: '0.95rem',
            }}
          >
            <li>강의 ID: {payload.meta.lectureId}</li>
            <li>제목: {payload.meta.title}</li>
            <li>언어: {payload.meta.language}</li>
            <li>PDF 파일: {payload.meta.source?.pdfFileId ?? '없음'}</li>
            <li>전사 파일: {payload.meta.source?.transcriptFileId ?? '없음'}</li>
          </ul>
        </div>
        <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>참고 페이지</h3>
          <p style={{ color: '#1f2937', fontSize: '0.95rem' }}>
            {payload.meta.source?.pages && payload.meta.source.pages.length > 0
              ? payload.meta.source.pages.join(', ')
              : '지정된 페이지 없음'}
          </p>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>하이라이트</h3>
        <ul
          style={{
            listStyle: 'none',
            margin: '0.75rem 0 0',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {payload.highlights.map((highlight, index) => (
            <li
              key={index}
              style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem' }}
            >
              <div style={{ fontWeight: 600 }}>{highlight.point}</div>
              <p style={{ color: '#374151', margin: '0.4rem 0 0.6rem' }}>{highlight.why}</p>
              <div style={{ color: '#6b7280', fontSize: '0.85rem', display: 'flex', gap: '1rem' }}>
                <span>
                  PDF:{' '}
                  {highlight.sourceMap.pdfPages.length
                    ? highlight.sourceMap.pdfPages.join(', ')
                    : '—'}
                </span>
                <span>
                  타임스탬프:{' '}
                  {highlight.sourceMap.timestamps.length
                    ? highlight.sourceMap.timestamps.join(', ')
                    : '—'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>암기 포인트</h3>
        <ul
          style={{
            listStyle: 'none',
            margin: '0.75rem 0 0',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
          }}
        >
          {payload.memorization.map((memo, index) => (
            <li
              key={index}
              style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '0.9rem' }}
            >
              <div style={{ fontWeight: 600 }}>{memo.fact}</div>
              <p style={{ color: '#374151', marginTop: '0.35rem' }}>{memo.mnemonic}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>핵심 개념</h3>
        <ul
          style={{
            listStyle: 'none',
            margin: '0.75rem 0 0',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {payload.concepts.map((concept, index) => (
            <li
              key={index}
              style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem' }}
            >
              <div style={{ fontWeight: 600 }}>{concept.concept}</div>
              <p style={{ color: '#374151', margin: '0.35rem 0 0.5rem' }}>{concept.explanation}</p>
              {concept.relatedFigures.length > 0 && (
                <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                  관련 자료: {concept.relatedFigures.join(', ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {payload.quizSeeds?.length ? (
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>퀴즈 시드</h3>
          <ul
            style={{
              listStyle: 'none',
              margin: '0.75rem 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {payload.quizSeeds.map((seed, index) => (
              <li
                key={index}
                style={{ border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '0.9rem' }}
              >
                <div style={{ fontWeight: 600 }}>
                  {seed.topic} ({seed.difficulty})
                </div>
                {seed.pitfalls.length > 0 && (
                  <p style={{ color: '#374151', marginTop: '0.35rem' }}>
                    주의 포인트: {seed.pitfalls.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function QuizRunner({ quiz }: { quiz?: QuizDetail }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(Array(20).fill(null));
  const [revealed, setRevealed] = useState<boolean[]>(Array(20).fill(false));
  const [showScore, setShowScore] = useState(false);

  if (!quiz) {
    return (
      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          background: '#fff',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>퀴즈</h2>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>생성된 퀴즈가 없습니다.</p>
      </section>
    );
  }

  const quizSet = quiz.payload as QuizSet;
  const items = quizSet.items;
  const current = items[index];

  const score = answers.reduce<number>((total, answer, idx) => {
    if (answer === null) return total;
    return total + (items[idx].answer === answer ? 1 : 0);
  }, 0);

  const handleSelect = (optionIndex: number) => {
    if (revealed[index]) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = optionIndex;
      return next;
    });
    setRevealed((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const goNext = () => {
    if (index < items.length - 1) {
      setIndex((value) => value + 1);
    } else {
      setShowScore(true);
    }
  };

  const goPrevious = () => {
    if (index > 0) {
      setIndex((value) => value - 1);
    }
  };

  const reset = () => {
    setIndex(0);
    setAnswers(Array(items.length).fill(null));
    setRevealed(Array(items.length).fill(false));
    setShowScore(false);
  };

  return (
    <section
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>퀴즈</h2>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          모델 {quiz.model} · 생성일 {formatDate(quiz.createdAt)} · 현재 {index + 1}/{items.length}
          번 문항
        </p>
      </header>

      {showScore && (
        <div
          style={{
            background: '#ecfdf5',
            borderRadius: '0.75rem',
            padding: '1rem',
            color: '#047857',
            fontWeight: 600,
          }}
        >
          최종 점수: {score} / {items.length}
        </div>
      )}

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            {current.difficulty.toUpperCase()} · {current.tags.join(', ')}
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{current.stem}</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {current.options.map((option, optionIndex) => {
            const isSelected = answers[index] === optionIndex;
            const isCorrect = current.answer === optionIndex;
            const revealedState = revealed[index];
            const background = revealedState
              ? isCorrect
                ? '#dcfce7'
                : isSelected
                  ? '#fee2e2'
                  : '#f9fafb'
              : isSelected
                ? '#e0f2fe'
                : '#f9fafb';

            return (
              <button
                key={optionIndex}
                type="button"
                onClick={() => handleSelect(optionIndex)}
                style={{
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid #d1d5db',
                  background,
                  cursor: revealedState ? 'default' : 'pointer',
                }}
                disabled={revealedState}
              >
                <strong style={{ marginRight: '0.5rem' }}>
                  {String.fromCharCode(65 + optionIndex)}.
                </strong>
                {option}
              </button>
            );
          })}
        </div>

        {revealed[index] && (
          <div
            style={{
              background: '#f8fafc',
              borderRadius: '0.75rem',
              padding: '1rem',
              color: '#1f2937',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '0.35rem' }}>정답 해설</strong>
            <p style={{ margin: 0 }}>{current.rationale}</p>
            <div
              style={{
                color: '#6b7280',
                fontSize: '0.85rem',
                marginTop: '0.6rem',
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <span>
                PDF:{' '}
                {current.sourceRef.pdfPages?.length ? current.sourceRef.pdfPages.join(', ') : '—'}
              </span>
              <span>
                타임스탬프:{' '}
                {current.sourceRef.timestamps?.length
                  ? current.sourceRef.timestamps.join(', ')
                  : '—'}
              </span>
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={goPrevious}
              disabled={index === 0}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '0.75rem',
                padding: '0.45rem 0.9rem',
                background: index === 0 ? '#e5e7eb' : '#fff',
                color: '#1f2937',
                cursor: index === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              이전
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!revealed[index]}
              style={{
                border: 'none',
                borderRadius: '0.75rem',
                padding: '0.45rem 0.9rem',
                background: revealed[index] ? '#1d4ed8' : '#94a3b8',
                color: '#fff',
                cursor: revealed[index] ? 'pointer' : 'not-allowed',
              }}
            >
              {index < items.length - 1 ? '다음' : '결과 보기'}
            </button>
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '0.75rem',
              padding: '0.45rem 0.9rem',
              background: '#fff',
              color: '#1f2937',
              cursor: 'pointer',
            }}
          >
            다시 풀기
          </button>
        </div>
      </div>
    </section>
  );
}

function JobHistory({ jobs }: { jobs?: LectureDetail['jobs'] }) {
  if (!jobs || jobs.length === 0) {
    return null;
  }

  return (
    <section
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
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>잡 이력</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>타입</th>
              <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>상태</th>
              <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>시작</th>
              <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>완료</th>
              <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>오류</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>{job.type}</td>
                <td
                  style={{
                    padding: '0.5rem',
                    borderBottom: '1px solid #e5e7eb',
                    color:
                      job.status === 'SUCCEEDED'
                        ? '#15803d'
                        : job.status === 'NEEDS_ATTENTION' || job.status === 'FAILED'
                          ? '#dc2626'
                          : '#1f2937',
                  }}
                >
                  {job.status}
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                  {formatDate(job.startedAt)}
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                  {formatDate(job.completedAt)}
                </td>
                <td
                  style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}
                >
                  {job.lastError ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LectureDetailPage() {
  const params = useParams<{ lectureId: string }>();
  const lectureId = params?.lectureId ?? '';

  const { data, error, isLoading, mutate } = useSWR<LectureDetail>(
    lectureId ? ['lecture-detail', lectureId] : null,
    async () => {
      const response = await getLectureDetail(lectureId);
      return response.lecture;
    },
    { refreshInterval: REFRESH_INTERVAL_MS },
  );

  const latestSummary = useMemo(() => data?.summaries?.[0], [data]);
  const latestQuiz = useMemo(() => data?.quizzes?.[0], [data]);

  const rerunSummary = async () => {
    if (!lectureId) return;
    await triggerSummarize(lectureId, { force: true });
    mutate();
  };

  const rerunQuiz = async () => {
    if (!lectureId) return;
    await triggerQuiz(lectureId, { force: true });
    mutate();
  };

  return (
    <main
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '2rem 1.5rem 4rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <Link href="/dashboard" style={{ color: '#2563eb', fontSize: '0.95rem' }}>
          ← 대시보드로 돌아가기
        </Link>
        {isLoading && <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>강의 로딩 중...</h1>}
        {error && (
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#dc2626' }}>
            강의를 불러올 수 없습니다.
          </h1>
        )}
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>{data.title}</h1>
            <p style={{ color: '#4b5563', fontSize: '1rem' }}>{data.description ?? '설명 없음'}</p>
            <div style={{ color: '#6b7280', fontSize: '0.95rem' }}>
              {data.language.toUpperCase()} · {data.modality} · 생성일 {formatDate(data.createdAt)}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
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
              <Link
                href={`/admin/jobs?lecture=${lectureId}`}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  padding: '0.45rem 0.85rem',
                  color: '#1f2937',
                }}
              >
                관리자 진단 보기
              </Link>
            </div>
          </div>
        )}
      </header>

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <SummarySection summary={latestSummary} />
          <QuizRunner quiz={latestQuiz} />
          <JobHistory jobs={data.jobs} />
        </div>
      )}
    </main>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

import { getLectureDetail, triggerQuiz, triggerSummarize } from '../../../lib/api';
import type { LectureDetail, QuizDetail, SummaryDetail } from '../../../lib/types';
import type { LectureSummary, QuizSet } from '@quizdude/shared';

import { Card, CardHeader, CardFooter } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { StatusIndicator } from '../../../components/ui/status-indicator';

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
      <Card className="border-slate-800/80 bg-slate-900/70">
        <CardHeader
          title="요약"
          description="생성된 요약이 없습니다. Blob 업로드와 전사가 완료된 뒤 요약을 실행하세요."
        />
      </Card>
    );
  }

  const payload = summary.payload as LectureSummary;

  return (
    <Card className="border-slate-800/80 bg-slate-900/70">
      <CardHeader
        title="요약"
        description={`모델 ${summary.model} · 생성일 ${formatDate(summary.createdAt)}`}
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <h3 className="text-sm font-semibold text-slate-200">메타 정보</h3>
            <dl className="mt-3 space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <dt>Lecture ID</dt>
                <dd className="text-slate-200">{payload.meta.lectureId}</dd>
              </div>
              <div className="flex justify-between">
                <dt>언어</dt>
                <dd className="text-slate-200">{payload.meta.language}</dd>
              </div>
              <div className="flex justify-between">
                <dt>PDF 파일</dt>
                <dd className="max-w-[200px] truncate text-slate-200">
                  {payload.meta.source?.pdfFileId ?? '없음'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>전사 파일</dt>
                <dd className="max-w-[200px] truncate text-slate-200">
                  {payload.meta.source?.transcriptFileId ?? '없음'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <h3 className="text-sm font-semibold text-slate-200">참고 페이지</h3>
            <p className="mt-3 text-xs text-slate-300">
              {payload.meta.source?.pages && payload.meta.source.pages.length > 0
                ? payload.meta.source.pages.join(', ')
                : '지정된 페이지가 없습니다.'}
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-200">핵심 하이라이트</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {payload.highlights.map((highlight, index) => (
              <div key={index} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <h4 className="font-semibold text-slate-200">{highlight.point}</h4>
                <p className="mt-2 text-sm text-slate-300">{highlight.why}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <Badge variant="muted">
                    PDF: {highlight.sourceMap.pdfPages.join(', ') || '—'}
                  </Badge>
                  <Badge variant="muted">
                    타임스탬프: {highlight.sourceMap.timestamps.join(', ') || '—'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <h3 className="text-sm font-semibold text-slate-200">암기 포인트</h3>
            <ul className="mt-3 space-y-3 text-sm text-slate-300">
              {payload.memorization.map((memo, index) => (
                <li key={index}>
                  <strong className="text-slate-200">{memo.fact}</strong>
                  <p className="text-xs text-slate-400">{memo.mnemonic}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <h3 className="text-sm font-semibold text-slate-200">핵심 개념</h3>
            <ul className="mt-3 space-y-3 text-sm text-slate-300">
              {payload.concepts.map((concept, index) => (
                <li key={index}>
                  <strong className="text-slate-200">{concept.concept}</strong>
                  <p className="text-xs text-slate-400">{concept.explanation}</p>
                  {concept.relatedFigures.length > 0 && (
                    <p className="text-xs text-slate-500">
                      관련 자료: {concept.relatedFigures.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {payload.quizSeeds?.length ? (
          <div>
            <h3 className="text-sm font-semibold text-slate-200">퀴즈 시드</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {payload.quizSeeds.map((seed, index) => (
                <Badge key={index} variant="muted">
                  {seed.topic} · {seed.difficulty}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function QuizRunner({ quiz }: { quiz?: QuizDetail }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(Array(20).fill(null));
  const [revealed, setRevealed] = useState<boolean[]>(Array(20).fill(false));
  const [showScore, setShowScore] = useState(false);

  if (!quiz) {
    return (
      <Card className="border-slate-800/80 bg-slate-900/70">
        <CardHeader
          title="퀴즈"
          description="생성된 퀴즈가 없습니다. 요약 생성 후 퀴즈를 실행하세요."
        />
      </Card>
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
    <Card className="border-slate-800/80 bg-slate-900/70">
      <CardHeader
        title="퀴즈"
        description={`모델 ${quiz.model} · 생성일 ${formatDate(quiz.createdAt)} · ${index + 1}/${items.length}번 문항`}
      />
      <div className="flex flex-col gap-6">
        {showScore && (
          <div className="rounded-2xl border border-brand-400/40 bg-brand-500/10 px-4 py-3 text-brand-100">
            최종 점수: {score} / {items.length}
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            {current.difficulty.toUpperCase()} · {current.tags.join(', ')}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">{current.stem}</h3>
        </div>

        <div className="flex flex-col gap-3">
          {current.options.map((option, optionIndex) => {
            const isSelected = answers[index] === optionIndex;
            const isCorrect = current.answer === optionIndex;
            const revealedState = revealed[index];
            const background = revealedState
              ? isCorrect
                ? 'bg-success/15 border-success/40'
                : isSelected
                  ? 'bg-danger/20 border-danger/40'
                  : 'bg-slate-900/70 border-slate-800'
              : isSelected
                ? 'bg-brand-500/20 border-brand-400/40'
                : 'bg-slate-900/70 border-slate-800';

            return (
              <button
                key={optionIndex}
                type="button"
                onClick={() => handleSelect(optionIndex)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm text-slate-200 transition ${background}`}
                disabled={revealedState}
              >
                <span className="mr-3 font-semibold text-brand-200">
                  {String.fromCharCode(65 + optionIndex)}.
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {revealed[index] && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
            <strong className="text-slate-100">정답 해설</strong>
            <p className="mt-2 text-slate-300">{current.rationale}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
              <Badge variant="muted">
                PDF{' '}
                {current.sourceRef.pdfPages?.length ? current.sourceRef.pdfPages.join(', ') : '—'}
              </Badge>
              <Badge variant="muted">
                타임스탬프{' '}
                {current.sourceRef.timestamps?.length
                  ? current.sourceRef.timestamps.join(', ')
                  : '—'}
              </Badge>
            </div>
          </div>
        )}

        <CardFooter>
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" size="sm" onClick={goPrevious} disabled={index === 0}>
              이전 문항
            </Button>
            <Button variant="primary" size="sm" onClick={goNext} disabled={!revealed[index]}>
              {index < items.length - 1 ? '다음 문항' : '결과 보기'}
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              다시 풀기
            </Button>
          </div>
        </CardFooter>
      </div>
    </Card>
  );
}

function JobHistory({ jobs }: { jobs?: LectureDetail['jobs'] }) {
  if (!jobs || jobs.length === 0) {
    return null;
  }

  return (
    <Card className="border-slate-800/80 bg-slate-900/70">
      <CardHeader title="잡 이력" description="요약·퀴즈·전사 잡 상태를 시간순으로 확인하세요." />
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">타입</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">시작</th>
              <th className="px-4 py-3">완료</th>
              <th className="px-4 py-3">오류</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-200">
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="px-4 py-3 uppercase text-slate-400">{job.type}</td>
                <td className="px-4 py-3">
                  <StatusIndicator status={job.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">{formatDate(job.startedAt)}</td>
                <td className="px-4 py-3 text-xs text-slate-300">{formatDate(job.completedAt)}</td>
                <td className="px-4 py-3 text-xs text-danger">{job.lastError ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-brand-200"
        >
          <ArrowLeftIcon className="h-4 w-4" /> 대시보드로 돌아가기
        </Link>
        {isLoading && <h1 className="text-3xl font-semibold text-white">강의 로딩 중...</h1>}
        {error && (
          <h1 className="text-3xl font-semibold text-danger">강의를 불러올 수 없습니다.</h1>
        )}
        {data && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-white">{data.title}</h1>
              <Badge variant="muted">{data.language.toUpperCase()}</Badge>
              <Badge variant="muted">{data.modality}</Badge>
              {data.audioPipelineEnabled && <Badge variant="default">Audio Pipeline</Badge>}
            </div>
            <p className="text-sm text-slate-300">{data.description ?? '설명 없음'}</p>
            <div className="text-xs text-slate-400">
              생성일 {formatDate(data.createdAt)} · 업데이트 {formatDate(data.updatedAt)}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="sm" onClick={rerunSummary}>
                <ArrowPathIcon className="mr-2 h-4 w-4" /> 요약 재실행
              </Button>
              <Button variant="secondary" size="sm" onClick={rerunQuiz}>
                퀴즈 재실행
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/jobs?lecture=${lectureId}`}>관리자 진단 보기</Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      {data && (
        <div className="flex flex-col gap-6">
          <SummarySection summary={latestSummary} />
          <QuizRunner quiz={latestQuiz} />
          <JobHistory jobs={data.jobs} />
        </div>
      )}
    </div>
  );
}

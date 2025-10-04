'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

import { getLectureDetail, listLectures, triggerQuiz, triggerSummarize } from '../../../lib/api';
import type { LectureDetail, LectureListItem } from '../../../lib/types';
import type { LectureSummary, QuizSet } from '@quizdude/shared';

import { Card, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { StatusIndicator } from '../../../components/ui/status-indicator';

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
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <strong className="text-sm text-slate-200">{label}</strong>
        <span className="text-xs text-slate-500">자료 없음</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <strong className="text-sm text-slate-200">{label}</strong>
      <pre className="max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200 shadow-inner shadow-slate-900/80">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function AdminJobsPageContent() {
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

  const {
    data: lectureDetail,
    error: detailError,
    isLoading,
    mutate,
  } = useSWR<LectureDetail>(
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
    <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-fit border-slate-800/80 bg-slate-900/70">
        <CardHeader title="강의 목록" description="진단할 강의를 선택하세요." />
        <div className="flex flex-col gap-3">
          <Button asChild variant="ghost" size="sm" className="justify-start text-slate-300">
            <Link href="/dashboard">← 대시보드</Link>
          </Button>
          <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-800/60 bg-slate-950/50 p-3">
            {lectures && lectures.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {lectures.map((lecture) => {
                  const isActive = lecture.id === selectedLectureId;
                  return (
                    <li key={lecture.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectLecture(lecture.id)}
                        className={clsx(
                          'w-full rounded-2xl border px-4 py-3 text-left transition',
                          isActive
                            ? 'border-brand-400/40 bg-brand-500/20 text-brand-100'
                            : 'border-slate-800 bg-slate-900/80 text-slate-200 hover:border-brand-400/30 hover:bg-slate-900',
                        )}
                      >
                        <div className="text-sm font-semibold">{lecture.title}</div>
                        <div className="text-xs text-slate-400">
                          생성일 {formatDate(lecture.createdAt)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">강의가 없습니다.</p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        {!selectedLectureId && (
          <Card className="border-slate-800/80 bg-slate-900/70">
            <CardHeader
              title="강의를 선택하세요"
              description="좌측 목록에서 진단할 강의를 선택하면 상세 정보가 표시됩니다."
            />
          </Card>
        )}
        {selectedLectureId && isLoading && (
          <Card className="border-slate-800/80 bg-slate-900/70">
            <CardHeader title="강의 데이터를 불러오는 중..." />
          </Card>
        )}
        {detailError && (
          <Card className="border-slate-800/80 bg-slate-900/70">
            <CardHeader title="강의 상세 정보를 불러올 수 없습니다." />
          </Card>
        )}

        {lectureDetail && (
          <>
            <Card className="border-slate-800/80 bg-slate-900/70">
              <CardHeader
                title={lectureDetail.title}
                description={lectureDetail.description ?? '설명이 없습니다.'}
              />
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <Badge variant="muted">{lectureDetail.language.toUpperCase()}</Badge>
                <Badge variant="muted">{lectureDetail.modality}</Badge>
                {lectureDetail.audioPipelineEnabled && (
                  <Badge variant="default">Audio Pipeline</Badge>
                )}
                <span>생성일 {formatDate(lectureDetail.createdAt)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="primary" size="sm" onClick={rerunSummary}>
                  <ArrowPathIcon className="mr-2 h-4 w-4" /> 요약 재실행
                </Button>
                <Button variant="secondary" size="sm" onClick={rerunQuiz}>
                  퀴즈 재실행
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/lectures/${lectureDetail.id}`}>강의 상세 페이지</Link>
                </Button>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-slate-800/80 bg-slate-900/70">
                <CardHeader title="최근 요약" />
                {latestSummary ? (
                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">생성됨</Badge>
                      <span className="text-xs text-slate-400">
                        {formatDate(latestSummary.createdAt)}
                      </span>
                    </div>
                    <RawJson
                      label="요약 페이로드"
                      value={latestSummary.payload as LectureSummary}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">요약 데이터가 없습니다.</p>
                )}
              </Card>
              <Card className="border-slate-800/80 bg-slate-900/70">
                <CardHeader title="최근 퀴즈" />
                {latestQuiz ? (
                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">생성됨</Badge>
                      <span className="text-xs text-slate-400">
                        {formatDate(latestQuiz.createdAt)}
                      </span>
                    </div>
                    <RawJson label="퀴즈 페이로드" value={latestQuiz.payload as QuizSet} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">퀴즈 데이터가 없습니다.</p>
                )}
              </Card>
            </div>

            <Card className="border-slate-800/80 bg-slate-900/70">
              <CardHeader title="업로드 현황" />
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3">유형</th>
                      <th className="px-4 py-3">상태</th>
                      <th className="px-4 py-3">사이즈</th>
                      <th className="px-4 py-3">업데이트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {lectureDetail.uploads.map((upload) => (
                      <tr key={upload.id}>
                        <td className="px-4 py-3 uppercase text-slate-400">{upload.type}</td>
                        <td className="px-4 py-3">
                          <Badge variant="muted">{upload.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">
                          {upload.sizeBytes
                            ? `${(upload.sizeBytes / 1024 / 1024).toFixed(2)} MB`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">
                          {formatDate(upload.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="border-slate-800/80 bg-slate-900/70">
              <CardHeader title="잡 이력" />
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
                    {lectureDetail.jobs.map((job) => (
                      <tr key={job.id}>
                        <td className="px-4 py-3 uppercase text-slate-400">{job.type}</td>
                        <td className="px-4 py-3">
                          <StatusIndicator status={job.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">
                          {formatDate(job.startedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">
                          {formatDate(job.completedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-danger">{job.lastError ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="border-slate-800/80 bg-slate-900/70">
              <CardHeader
                title="Raw Response"
                description="요약/퀴즈 원본 응답을 JSON 형태로 확인합니다."
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <RawJson label="Summary rawResponse" value={latestSummary?.rawResponse} />
                <RawJson label="Quiz rawResponse" value={latestQuiz?.rawResponse} />
              </div>
            </Card>
          </>
        )}
      </div>
    </section>
  );
}

export default function AdminJobsPage() {
  return (
    <Suspense>
      <AdminJobsPageContent />
    </Suspense>
  );
}

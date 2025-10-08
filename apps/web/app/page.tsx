import Link from 'next/link';

import { Card, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const highlights = [
  {
    title: '강의 업로드 파이프라인',
    description: 'PDF·미디어 업로드, Blob URL 발급, 상태 추적을 한 곳에서 제어합니다.',
    href: '/dashboard',
    action: '업로드 대시보드로 이동',
  },
  {
    title: '생성된 요약 & 퀴즈 검토',
    description: 'Gemini 기반 요약과 20문항 퀴즈를 실시간으로 확인하고 재생성하세요.',
    href: '/lectures',
    action: '최근 강의 확인',
    disabled: true,
  },
  {
    title: '잡 & 워커 모니터링',
    description: 'Prisma JobRun 상태, 재시도 스케줄, 오류 로그를 빠르게 점검합니다.',
    href: '/admin/jobs',
    action: '관리자 진단 열기',
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-xl border-2 border-sky-200 bg-white/95 px-8 py-12 shadow-card">
        <Badge variant="default" className="mb-4 self-start">
          Gemini · Prisma · Blob Orchestration
        </Badge>
        <h1 className="max-w-2xl text-4xl font-bold text-slate-900 lg:text-5xl">
          강의 자료 업로드부터 요약·퀴즈 생성까지 자동화하는{' '}
          <span className="text-brand-600">Quizdude Control Center</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          PDF/미디어 업로드부터 Gemini 연동, 잡 모니터링까지 모든 파이프라인을 한 대시보드에서
          운영합니다. Render 워커와 Vercel 프론트가 동일한 빌드 파이프라인을 사용하도록 설계되어
          배포 편차를 최소화했습니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link href="/dashboard">새 강의 업로드 시작</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/admin/jobs">잡 상태 모니터링</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {highlights.map((item) => (
          <Card key={item.title} className="h-full">
            <CardHeader title={item.title} description={item.description} />
            <div className="flex items-center justify-between">
              <Button
                asChild
                variant={item.disabled ? 'ghost' : 'primary'}
                size="sm"
                className={item.disabled ? 'pointer-events-none opacity-50' : undefined}
              >
                <Link href={item.href}>{item.action}</Link>
              </Button>
              {item.disabled && <Badge variant="muted">곧 지원 예정</Badge>}
            </div>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Render Worker 상태"
            description="워커 인스턴스·잡 재시도·에러 로그를 빠르게 확인하세요."
          />
          <ul className="space-y-3 text-sm text-slate-600">
            <li>• 병렬 워커 루프와 지수 백오프 재시도로 안정적인 JobRun 처리를 보장합니다.</li>
            <li>• pnpm@9.15.5 Corepack 고정으로 Vercel·Render 간 빌드 환경을 통일했습니다.</li>
            <li>
              • Prisma 마이그레이션 누락 시 Start Command에 `prisma migrate deploy`를 임시로 추가할
              수 있습니다.
            </li>
          </ul>
        </Card>
        <Card>
          <CardHeader
            title="빠른 체크리스트"
            description="배포 전 반드시 아래 항목을 확인하세요."
          />
          <ul className="space-y-3 text-sm text-slate-600">
            <li>
              • Blob 토큰, Gemini 키, DATABASE_URL 등 주요 환경 변수가 Render와 Vercel에 모두
              설정되어 있는가?
            </li>
            <li>
              • `pnpm --filter @quizdude/db exec prisma migrate status`로 스키마가 최신 상태인지
              확인했는가?
            </li>
            <li>
              • Cron 서비스 생성 시 워커와 동일한 빌드/시작 명령을 사용하고 로그를 AGENTS.md에
              기록했는가?
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

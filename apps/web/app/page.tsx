import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <section>
        <h1 className="text-3xl font-bold">Quizdude Lecture Pipeline</h1>
        <p className="text-neutral-600">
          Upload lecture materials, monitor processing jobs, and review generated summaries and quizzes.
        </p>
      </section>
      <section className="flex flex-col gap-4">
        <Link className="text-blue-600 underline" href="/dashboard">
          Open upload dashboard
        </Link>
        <Link className="text-blue-600 underline" href="/admin/jobs">
          Open admin diagnostics
        </Link>
      </section>
    </main>
  );
}

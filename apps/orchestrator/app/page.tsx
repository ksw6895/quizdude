export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>Quizdude Orchestrator</h1>
      <p style={{ marginTop: '1rem', maxWidth: '36rem' }}>
        This orchestrator service exposes API endpoints for lecture processing workflows. Use the
        API routes under <code>/api/lectures</code> to upload content, trigger summarization,
        generate quizzes, and manage transcripts.
      </p>
      <p style={{ marginTop: '1.5rem', color: '#555' }}>
        If you are looking for the main Quizdude app, return to the primary front-end, or consult
        the API documentation for usage details.
      </p>
    </main>
  );
}

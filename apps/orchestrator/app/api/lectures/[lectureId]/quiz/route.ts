import { handleOptions, handleRoute } from '../../../../../lib/http';
import { triggerQuiz } from '../../../../../lib/services/lectureService';

export async function POST(request: Request, { params }: { params: { lectureId: string } }) {
  return handleRoute(request, async () => {
    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      json = {};
    }
    const data = await triggerQuiz(params.lectureId, json);
    return { body: data, status: 202 };
  });
}

export function OPTIONS(request: Request) {
  return handleOptions(request);
}

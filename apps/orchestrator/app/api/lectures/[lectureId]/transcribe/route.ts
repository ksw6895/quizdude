import { handleRoute } from '../../../../../lib/http.js';
import { triggerTranscription } from '../../../../../lib/services/lectureService.js';

export async function POST(request: Request, { params }: { params: { lectureId: string } }) {
  return handleRoute(async () => {
    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      json = {};
    }
    const data = await triggerTranscription(params.lectureId, json);
    return { body: data, status: 202 };
  });
}

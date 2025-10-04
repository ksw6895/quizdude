import { handleOptions, handleRoute } from '../../../lib/http';
import { createLecture, listLectures } from '../../../lib/services/lectureService';

export async function GET(request: Request) {
  return handleRoute(request, async () => {
    const data = await listLectures();
    return { body: data };
  });
}

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const json = await request.json();
    const data = await createLecture(json);
    return { body: data, status: 201 };
  });
}

export function OPTIONS(request: Request) {
  return handleOptions(request);
}

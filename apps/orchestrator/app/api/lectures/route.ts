import { handleRoute } from '../../../lib/http';
import { createLecture, listLectures } from '../../../lib/services/lectureService';

export async function GET() {
  return handleRoute(async () => {
    const data = await listLectures();
    return { body: data };
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const json = await request.json();
    const data = await createLecture(json);
    return { body: data, status: 201 };
  });
}

import { handleOptions, handleRoute } from '../../../../lib/http';
import { getLectureDetail } from '../../../../lib/services/lectureService';

export async function GET(request: Request, { params }: { params: { lectureId: string } }) {
  return handleRoute(request, async () => {
    const data = await getLectureDetail(params.lectureId);
    return { body: data };
  });
}

export function OPTIONS(request: Request) {
  return handleOptions(request);
}

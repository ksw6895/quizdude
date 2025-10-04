import { handleRoute } from '../../../../lib/http.js';
import { getLectureDetail } from '../../../../lib/services/lectureService.js';

export async function GET(_request: Request, { params }: { params: { lectureId: string } }) {
  return handleRoute(async () => {
    const data = await getLectureDetail(params.lectureId);
    return { body: data };
  });
}

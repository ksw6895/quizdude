import { handleRoute } from '../../../../../lib/http.js';
import { updateUploadStatuses } from '../../../../../lib/services/lectureService.js';

export async function PATCH(request: Request, { params }: { params: { lectureId: string } }) {
  return handleRoute(async () => {
    const json = await request.json();
    const data = await updateUploadStatuses(params.lectureId, json);
    return { body: data };
  });
}

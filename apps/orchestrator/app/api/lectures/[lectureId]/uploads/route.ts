import { handleOptions, handleRoute } from '../../../../../lib/http';
import { updateUploadStatuses } from '../../../../../lib/services/lectureService';

export async function PATCH(request: Request, { params }: { params: { lectureId: string } }) {
  return handleRoute(request, async () => {
    const json = await request.json();
    const data = await updateUploadStatuses(params.lectureId, json);
    return { body: data };
  });
}

export function OPTIONS(request: Request) {
  return handleOptions(request);
}

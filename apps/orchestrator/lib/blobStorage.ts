import { createUploadTarget, type BlobObjectKind, type UploadTarget } from '@quizdude/shared';

import { getRuntimeConfig } from './config/env';

interface GenerateLectureUploadInput {
  lectureId: string;
  objects: Array<{
    kind: BlobObjectKind;
    contentType: string;
    filename: string;
  }>;
}

export async function generateLectureUploadTargets(
  input: GenerateLectureUploadInput,
): Promise<UploadTarget[]> {
  const { lectureId, objects } = input;
  const {
    blob: { readWriteToken, publicBaseUrl },
  } = getRuntimeConfig();

  const targets = await Promise.all(
    objects.map((object) =>
      createUploadTarget({
        lectureId,
        objectKey: object.filename,
        contentType: object.contentType,
        kind: object.kind,
        readWriteToken,
        publicBaseUrl,
      }),
    ),
  );
  return targets;
}

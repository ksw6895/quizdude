import { createUploadTarget, type BlobObjectKind, type UploadTarget } from '@quizdude/shared';

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
  const targets = await Promise.all(
    objects.map((object) =>
      createUploadTarget({
        lectureId,
        objectKey: object.filename,
        contentType: object.contentType,
        kind: object.kind,
      }),
    ),
  );
  return targets;
}

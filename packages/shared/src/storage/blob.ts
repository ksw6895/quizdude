import type { PutBlobResult } from '@vercel/blob';
import { createUploadUrl } from '@vercel/blob';

export type BlobObjectKind = 'pdf' | 'audio' | 'video' | 'transcript';

export interface CreateUploadTargetInput {
  lectureId: string;
  objectKey: string;
  contentType: string;
  kind: BlobObjectKind;
  access?: 'public' | 'private';
  cacheControl?: string;
}

export interface UploadTarget {
  url: string;
  token: string;
  id: string;
  kind: BlobObjectKind;
  contentType: string;
}

export async function createUploadTarget(
  input: CreateUploadTargetInput,
): Promise<UploadTarget> {
  const { lectureId, objectKey, contentType, kind, access = 'private', cacheControl } = input;

  const response = await createUploadUrl({
    access,
    tokenPayload: {
      lectureId,
      kind,
    },
    allowedContentTypes: [contentType],
    metadata: {
      lectureId,
      kind,
    },
    cacheControl,
    contentType,
    filename: objectKey,
  });

  return {
    url: response.url,
    token: response.token,
    id: `${lectureId}/${kind}/${objectKey}`,
    kind,
    contentType,
  };
}

export async function storeBuffer(
  key: string,
  data: ArrayBuffer,
  options: { contentType: string },
): Promise<PutBlobResult> {
  return createUploadUrl({
    access: 'private',
    filename: key,
    contentType: options.contentType,
  }).then(async (upload) => {
    const res = await fetch(upload.url, {
      method: 'PUT',
      headers: {
        'Content-Type': options.contentType,
        Authorization: `Bearer ${upload.token}`,
      },
      body: data,
    });

    if (!res.ok) {
      throw new Error(`Failed to upload blob: ${res.status} ${res.statusText}`);
    }

    const result = (await res.json()) as PutBlobResult;
    return result;
  });
}

import type { PutBlobResult } from '@vercel/blob';
import {
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
} from '@vercel/blob/client';

export type BlobObjectKind = 'pdf' | 'audio' | 'video' | 'transcript';

export interface CreateUploadTargetInput {
  lectureId: string;
  objectKey: string;
  contentType: string;
  kind: BlobObjectKind;
  access?: 'public' | 'private';
  cacheControl?: number;
}

export interface UploadTarget {
  url: string;
  token: string;
  pathname: string;
  id: string;
  kind: BlobObjectKind;
  contentType: string;
}

function ensureReadWriteToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN environment variable is not configured.');
  }
  return token;
}

function resolveStoreBaseUrl(token: string): string {
  const parts = token.split('_');
  const storeId = parts[3];
  if (!storeId) {
    throw new Error('Invalid BLOB_READ_WRITE_TOKEN format.');
  }
  return `https://${storeId}.public.blob.vercel-storage.com`;
}

export async function createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
  const { lectureId, objectKey, contentType, kind, cacheControl } = input;

  const readWriteToken = ensureReadWriteToken();
  const pathname = `${lectureId}/${kind}/${objectKey}`;

  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: [contentType],
    addRandomSuffix: false,
    cacheControlMaxAge: cacheControl,
    token: readWriteToken,
  });

  const payload = getPayloadFromClientToken(token);
  if (payload.pathname !== pathname) {
    throw new Error('Generated client token payload does not match requested pathname.');
  }

  const baseUrl = process.env.BLOB_PUBLIC_BASE_URL ?? resolveStoreBaseUrl(readWriteToken);
  const url = `${baseUrl}/${pathname}`;

  return {
    url,
    token,
    pathname,
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
  const readWriteToken = ensureReadWriteToken();
  const pathname = key;
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: [options.contentType],
    addRandomSuffix: false,
    token: readWriteToken,
  });

  const baseUrl = process.env.BLOB_PUBLIC_BASE_URL ?? resolveStoreBaseUrl(readWriteToken);
  const url = `${baseUrl}/${pathname}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': options.contentType,
      Authorization: `Bearer ${token}`,
    },
    body: data,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload blob: ${res.status} ${res.statusText}`);
  }

  const result = (await res.json()) as PutBlobResult;
  return result;
}

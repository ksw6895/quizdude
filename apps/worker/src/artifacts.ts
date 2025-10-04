import path from 'node:path';
import { URL } from 'node:url';

import { head } from '@vercel/blob';
import type { Upload } from '@quizdude/db';

export interface DownloadedUpload {
  data: ArrayBuffer;
  sizeBytes: number;
  mimeType: string;
  displayName: string;
}

export async function downloadUpload(upload: Upload): Promise<DownloadedUpload> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const blobUrl = toBlobUrl(upload, token);

  const metadata = await head(blobUrl, token ? { token } : undefined);

  const response = await fetch(metadata.downloadUrl ?? blobUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to download blob ${upload.blobKey}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const displayName = path.basename(upload.blobKey);

  return {
    data: arrayBuffer,
    sizeBytes: metadata.size ?? arrayBuffer.byteLength,
    mimeType: upload.contentType || metadata.contentType || 'application/octet-stream',
    displayName,
  };
}

function toBlobUrl(upload: Upload, token?: string | undefined): string {
  if (upload.blobKey.startsWith('http')) {
    return upload.blobKey;
  }

  const baseUrlFromUpload = safeOrigin(upload.uploadUrl);
  const baseUrlFromToken = token ? resolveStoreBaseUrl(token) : undefined;

  const baseUrl = baseUrlFromUpload ?? baseUrlFromToken ?? process.env.BLOB_PUBLIC_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      'Unable to determine Blob base URL. Set BLOB_PUBLIC_BASE_URL or provide uploadUrl.',
    );
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedKey = upload.blobKey.startsWith('/') ? upload.blobKey.slice(1) : upload.blobKey;
  return `${normalizedBase}/${normalizedKey}`;
}

function safeOrigin(url?: string | null): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function resolveStoreBaseUrl(token: string): string {
  const parts = token.split('_');
  const storeId = parts[3];
  if (!storeId) {
    throw new Error('Invalid BLOB_READ_WRITE_TOKEN format.');
  }
  return `https://${storeId}.public.blob.vercel-storage.com`;
}

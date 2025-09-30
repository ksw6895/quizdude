import path from 'node:path';

import { getBlob } from '@vercel/blob';
import type { Upload } from '@quizdude/db';

export interface DownloadedUpload {
  data: ArrayBuffer;
  sizeBytes: number;
  mimeType: string;
  displayName: string;
}

export async function downloadUpload(upload: Upload): Promise<DownloadedUpload> {
  const blob = await getBlob(upload.blobKey);
  if (!blob) {
    throw new Error(`Blob not found for key ${upload.blobKey}`);
  }

  const arrayBuffer = await blob.arrayBuffer();
  const displayName = path.basename(upload.blobKey);

  return {
    data: arrayBuffer,
    sizeBytes: blob.size ?? arrayBuffer.byteLength,
    mimeType: upload.contentType || blob.type || 'application/octet-stream',
    displayName,
  };
}

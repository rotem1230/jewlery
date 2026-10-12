export type UploadLimits = {
  maxBytes: number;
  allowedMimeTypes: string[];
};

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxBytes: 10_485_760,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'video/mp4',
    'audio/m4a',
    'audio/mp4',
    'audio/x-m4a',
    'audio/mpeg',
    'audio/wav',
  ],
};

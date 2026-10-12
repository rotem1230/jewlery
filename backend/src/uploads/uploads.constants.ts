export type UploadLimits = {
  maxBytes: number;
  allowedMimeTypes: string[];
  /** Per-user volume over a rolling 24 hours. */
  dailyMaxBytes: number;
  /** Per-user number of files over a rolling 24 hours. */
  dailyMaxFiles: number;
};

/**
 * Single source of truth for upload limits: used as the seeded AppConfig `upload_limits` row and
 * as the fallback for any field missing from that row.
 */
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
  dailyMaxBytes: 200 * 1024 * 1024,
  dailyMaxFiles: 300,
};

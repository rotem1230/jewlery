import { Request, Response } from 'express';

export type SendBytesOptions = {
  /** Strong validator of the content (quoted), e.g. `"<upload id>"`: stored bytes never change. */
  etag: string;
  /** Honour a single `Range: bytes=a-b` request (audio / video seeking). */
  ranges: boolean;
};

/**
 * Writes bytes held in memory the way `res.sendFile` serves a file on disk: Content-Length, an
 * ETag with conditional GET (304) and, when enabled, one byte range (206 with Content-Range, 416
 * when it starts past the end). Several ranges, another unit or a malformed header get the whole
 * body, as do ranges whose If-Range validator does not match. Content headers are the caller's.
 */
export function sendBytes(req: Request, res: Response, bytes: Buffer, options: SendBytesOptions): void {
  const size = bytes.length;
  res.setHeader('ETag', options.etag);
  if (options.ranges) {
    res.setHeader('Accept-Ranges', 'bytes');
  }
  if (req.fresh) {
    res.status(304).end();
    return;
  }

  const ifRange = req.headers['if-range'];
  if (options.ranges && req.headers.range && (ifRange === undefined || ifRange === options.etag)) {
    const ranges = req.range(size, { combine: true });
    if (ranges === -1) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }
    if (Array.isArray(ranges) && ranges.type === 'bytes' && ranges.length === 1) {
      const { start, end } = ranges[0];
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      res.end(bytes.subarray(start, end + 1));
      return;
    }
  }

  res.status(200);
  res.setHeader('Content-Length', String(size));
  res.end(bytes);
}

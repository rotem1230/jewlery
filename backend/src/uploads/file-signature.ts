/**
 * Checks that a file's leading bytes match the MIME type the client declared. The declared
 * Content-Type of a multipart part is attacker-controlled; only types we can positively identify
 * are accepted (HTML/SVG/scripts disguised as images are rejected).
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ascii(bytes: Buffer, start: number, end: number): string {
  return bytes.subarray(start, end).toString('latin1');
}

function isIsoBaseMedia(bytes: Buffer): boolean {
  // MP4 / M4A: a box size followed by the `ftyp` box type.
  return bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp';
}

function isMp3(bytes: Buffer): boolean {
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') {
    return true;
  }
  // MPEG audio frame sync: 11 set bits.
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

export function contentMatchesMimeType(mimeType: string, bytes: Buffer): boolean {
  if (bytes.length === 0) {
    return false;
  }
  switch (mimeType) {
    case 'image/png':
      return bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
    case 'image/jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/gif':
      return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6));
    case 'video/mp4':
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
      return isIsoBaseMedia(bytes);
    case 'audio/mpeg':
      return isMp3(bytes);
    case 'audio/wav':
      return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE';
    default:
      return false;
  }
}

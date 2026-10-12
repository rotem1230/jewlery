import { M4A_BYTES, PNG_BYTES } from '../../test/utils/fixtures';
import { contentMatchesMimeType } from './file-signature';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(16)]);
const MP3_ID3 = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([4, 0, 0, 0, 0, 0, 0])]);
const MP3_FRAME = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
const WAV = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt ', 'latin1')]);
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

describe('contentMatchesMimeType', () => {
  it.each([
    ['image/png', PNG_BYTES],
    ['image/jpeg', JPEG],
    ['image/gif', GIF],
    ['video/mp4', MP4],
    ['audio/mp4', M4A_BYTES],
    ['audio/m4a', M4A_BYTES],
    ['audio/x-m4a', M4A_BYTES],
    ['audio/mpeg', MP3_ID3],
    ['audio/mpeg', MP3_FRAME],
    ['audio/wav', WAV],
  ])('accepts genuine %s content', (mime, bytes) => {
    expect(contentMatchesMimeType(mime, bytes)).toBe(true);
  });

  it.each([
    ['image/png', HTML],
    ['image/png', SVG],
    ['image/jpeg', PNG_BYTES],
    ['image/gif', JPEG],
    ['audio/m4a', WAV],
    ['audio/wav', M4A_BYTES],
    ['video/mp4', HTML],
    ['audio/mpeg', HTML],
  ])('rejects %s claimed for foreign content', (mime, bytes) => {
    expect(contentMatchesMimeType(mime, bytes)).toBe(false);
  });

  it('rejects empty files and unknown types', () => {
    expect(contentMatchesMimeType('image/png', Buffer.alloc(0))).toBe(false);
    expect(contentMatchesMimeType('text/html', HTML)).toBe(false);
    expect(contentMatchesMimeType('image/svg+xml', SVG)).toBe(false);
  });
});

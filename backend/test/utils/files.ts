import { API, TestApp } from './test-app';
import { TestUser } from './factories';

/** 1x1 PNG. */
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Minimal MPEG-4 audio container header (ftyp box, brand "M4A "). */
export const M4A_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypM4A ', 'latin1'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('M4A isom', 'latin1'),
  Buffer.alloc(32, 1),
]);

export function uploadFile(t: TestApp, user: TestUser, bytes: Buffer, mime: string, name = 'f.bin') {
  return t.http.post(`${API}/uploads`).set(user.auth).attach('file', bytes, { filename: name, contentType: mime });
}

import { API, TestApp } from './test-app';
import { TestUser } from './factories';

export { M4A_BYTES, PNG_BYTES } from './fixtures';

export function uploadFile(t: TestApp, user: TestUser, bytes: Buffer, mime: string, name = 'f.bin') {
  return t.http.post(`${API}/uploads`).set(user.auth).attach('file', bytes, { filename: name, contentType: mime });
}

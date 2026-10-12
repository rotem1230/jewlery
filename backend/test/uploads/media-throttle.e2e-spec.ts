import { randomUUID } from 'crypto';
import { UploadsService } from '../../src/uploads/uploads.service';
import { API, createTestApp, TestApp } from '../utils/test-app';
import { PNG_BYTES } from '../utils/files';

/**
 * Regression: images and voice notes went through the general API rate limit (100 requests a
 * minute per client), so a chat or gallery full of media locked the user out of the API.
 */
describe('media delivery and the API rate limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { THROTTLE_LIMIT: '5', MEDIA_THROTTLE_LIMIT: '50' } });
  });

  afterAll(async () => {
    await t.close();
  });

  async function publicImage(): Promise<string> {
    const user = await t.prisma.user.create({
      data: { email: `${randomUUID()}@media.test`, passwordHash: 'x', status: 'ACTIVE', roles: ['DESIGNER'], activeRole: 'DESIGNER' },
    });
    const upload = await t.app.get(UploadsService).createGeneratedLocal(user.id, PNG_BYTES, 'image/png');
    await t.prisma.user.update({ where: { id: user.id }, data: { avatarUploadId: upload.id } });
    return upload.id;
  }

  it('loading many images does not use up the API budget', async () => {
    const id = await publicImage();
    for (let i = 0; i < 10; i += 1) {
      await t.http.get(`${API}/uploads/${id}/content`).expect(200);
    }
  });

  it('media has its own limit per client', async () => {
    const id = await publicImage();
    const statuses: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      statuses.push((await t.http.get(`${API}/uploads/${id}/content`)).status);
    }
    expect(statuses).toContain(429);
  });
});

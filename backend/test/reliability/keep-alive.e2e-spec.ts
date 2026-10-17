import * as http from 'http';
import { AddressInfo } from 'net';
import { API, createTestApp, TestApp } from '../utils/test-app';

/**
 * A client (the phone, or the hosting proxy in front of the API) keeps a connection open between
 * requests and sends the next request on it. If the server has quietly closed that connection,
 * a request whose body cannot be sent twice (a photo upload) fails with "Network request failed".
 * Node closes idle connections after 5 s by default: the server must keep them longer than the
 * proxy in front of it does.
 */
describe('Idle connections stay usable', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('a request sent on a connection idle for longer than Node’s 5 s default is answered on it', async () => {
    const { port } = (t.app.getHttpServer() as http.Server).address() as AddressInfo;
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const sockets = new Set<unknown>();
    const get = () =>
      new Promise<number>((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: `${API}/health`, agent }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        });
        req.on('socket', (socket) => sockets.add(socket));
        req.on('error', reject);
      });
    try {
      expect(await get()).toBe(200);
      await new Promise((r) => setTimeout(r, 6_000));
      expect(await get()).toBe(200);
      // Same connection both times: the server did not close it while it was idle.
      expect(sockets.size).toBe(1);
    } finally {
      agent.destroy();
    }
  }, 20_000);

  it('waits for request headers at least as long as it keeps an idle connection', () => {
    const server = t.app.getHttpServer() as http.Server;
    expect(server.keepAliveTimeout).toBeGreaterThan(60_000);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});

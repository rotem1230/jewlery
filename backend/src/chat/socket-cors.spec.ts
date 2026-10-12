import { isAllowedSocketOrigin } from './socket-cors';

describe('isAllowedSocketOrigin', () => {
  it('allows only configured browser origins', () => {
    const env = { CORS_ORIGINS: 'https://app.example.com', NODE_ENV: 'production' };
    expect(isAllowedSocketOrigin('https://app.example.com', env)).toBe(true);
    expect(isAllowedSocketOrigin('https://evil.example', env)).toBe(false);
  });

  it('has no localhost default in production', () => {
    expect(isAllowedSocketOrigin('http://localhost:3000', { NODE_ENV: 'production' })).toBe(false);
    expect(isAllowedSocketOrigin('http://localhost:3000', { NODE_ENV: 'development' })).toBe(true);
  });

  it('does not apply to native clients, which send no Origin', () => {
    expect(isAllowedSocketOrigin(undefined, { NODE_ENV: 'production' })).toBe(true);
  });
});

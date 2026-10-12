const fs = require('fs');

module.exports = async function globalTeardown() {
  const pg = globalThis.__MALINVOSKY_EMBEDDED_PG__;
  if (pg) {
    await pg.stop();
    const dir = globalThis.__MALINVOSKY_EMBEDDED_PG_DIR__;
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
};

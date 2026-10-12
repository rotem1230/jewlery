const fs = require('fs');
const path = require('path');

module.exports = async function globalTeardown() {
  const pg = globalThis.__MALINVOSKY_EMBEDDED_PG__;
  if (pg) {
    await pg.stop();
    const dir = globalThis.__MALINVOSKY_EMBEDDED_PG_DIR__;
    if (dir) {
      // TEST_PG_KEEP_LOG=1 keeps the server log next to the (removed) cluster for diagnosis.
      const log = path.join(dir, 'postgres.log');
      if (process.env.TEST_PG_KEEP_LOG && fs.existsSync(log)) {
        fs.copyFileSync(log, `${dir}.postgres.log`);
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
};

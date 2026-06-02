require('dotenv').config();

const { db } = require('../src/db');
const { discoverFavicon } = require('../src/favicon');

const force = process.argv.includes('--force');
const limitArg = process.argv.find((item) => item.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;
const concurrencyArg = process.argv.find((item) => item.startsWith('--concurrency='));
const concurrency = Math.max(Number(concurrencyArg ? concurrencyArg.split('=')[1] : 8), 1);

function shouldUpdate(tool) {
  if (force) return true;
  if (!tool.icon_url) return true;
  return tool.icon_url.includes('tboxn.com/wp-content/themes/onenav/assets/images/favicon.png') ||
    tool.icon_url === 'https://www.tboxn.com/';
}

async function main() {
  const tools = db.prepare('SELECT id, name, url, icon_url FROM tool ORDER BY id ASC').all()
    .filter(shouldUpdate);
  const selected = limit > 0 ? tools.slice(0, limit) : tools;

  let updated = 0;
  let skipped = 0;
  let cursor = 0;
  const update = db.prepare('UPDATE tool SET icon_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  async function worker() {
    while (cursor < selected.length) {
      const tool = selected[cursor];
      cursor += 1;
      try {
        const iconUrl = await discoverFavicon(tool.url);
        update.run(iconUrl, tool.id);
        updated += 1;
        console.log(`OK ${tool.name}: ${iconUrl}`);
      } catch (error) {
        skipped += 1;
        console.log(`SKIP ${tool.name}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
  console.log(`Icon fetch finished. Updated: ${updated}, skipped: ${skipped}, candidates: ${selected.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

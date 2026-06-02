const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { normalizeUrl } = require('./url-utils');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'toolfind.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const initSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');
db.exec(initSql);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('tool', 'last_checked_at', 'DATETIME');
ensureColumn('tool', 'last_health_status', "TEXT DEFAULT 'unknown'");
ensureColumn('tool', 'last_health_error', 'TEXT DEFAULT ""');
ensureColumn('tool', 'normalized_url', 'TEXT');

const normalizeRows = db.prepare('SELECT id, url, normalized_url FROM tool WHERE normalized_url IS NULL OR normalized_url = ?').all('');
const updateNormalizedUrl = db.prepare('UPDATE tool SET normalized_url = ? WHERE id = ?');
for (const row of normalizeRows) {
  updateNormalizedUrl.run(normalizeUrl(row.url), row.id);
}

for (const statement of [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_normalized_url_unique ON tool(normalized_url)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_name_lower_unique ON tool(lower(name))'
]) {
  try {
    db.exec(statement);
  } catch (error) {
    console.warn(`Skip unique index: ${error.message}`);
  }
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}

function syncToolTags(toolId, tags) {
  const cleanTags = normalizeTags(tags);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tag (name) VALUES (?)');
  const getTag = db.prepare('SELECT id FROM tag WHERE name = ?');
  const linkTag = db.prepare('INSERT OR IGNORE INTO tool_tag (tool_id, tag_id) VALUES (?, ?)');

  db.prepare('DELETE FROM tool_tag WHERE tool_id = ?').run(toolId);
  for (const tag of cleanTags) {
    insertTag.run(tag);
    const row = getTag.get(tag);
    linkTag.run(toolId, row.id);
  }
  refreshFtsTags(toolId);
}

function refreshFtsTags(toolId) {
  const row = db.prepare(`
    SELECT GROUP_CONCAT(tag.name, ' ') AS tags
    FROM tool_tag
    JOIN tag ON tag.id = tool_tag.tag_id
    WHERE tool_tag.tool_id = ?
  `).get(toolId);
  db.prepare('UPDATE tool_fts SET tags = ? WHERE rowid = ?').run(row?.tags || '', toolId);
}

function getToolTags(toolId) {
  return db.prepare(`
    SELECT tag.name
    FROM tool_tag
    JOIN tag ON tag.id = tool_tag.tag_id
    WHERE tool_tag.tool_id = ?
    ORDER BY tag.name
  `).all(toolId).map((row) => row.name);
}

module.exports = {
  db,
  syncToolTags,
  getToolTags,
  refreshFtsTags
};

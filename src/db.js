const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'toolfind.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const initSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');
db.exec(initSql);

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

require('dotenv').config();

const { db } = require('../src/db');
const { normalizeUrl } = require('../src/url-utils');
const { inferCategoryName, ensureCategory } = require('../src/taxonomy');

const reclassifyAll = process.argv.includes('--reclassify-all');
const compactCategoryIds = process.argv.includes('--compact-category-ids');

function updateNormalizedUrls() {
  const rows = db.prepare('SELECT id, url, normalized_url FROM tool').all();
  const update = db.prepare('UPDATE tool SET normalized_url = ? WHERE id = ?');
  let changed = 0;
  for (const row of rows) {
    const normalizedUrl = normalizeUrl(row.url);
    if (row.normalized_url !== normalizedUrl) {
      update.run(normalizedUrl, row.id);
      changed += 1;
    }
  }
  return changed;
}

function reclassifyTools() {
  const tools = db.prepare(`
    SELECT tool.id, tool.name, tool.description, category.name AS category_name
    FROM tool
    JOIN category ON category.id = tool.category_id
    ORDER BY tool.id ASC
  `).all();
  const update = db.prepare('UPDATE tool SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  let changed = 0;

  for (const tool of tools) {
    const nextCategoryName = inferCategoryName(tool.name, tool.description);
    if (!reclassifyAll && tool.category_name !== '其他') continue;
    if (tool.category_name === nextCategoryName) continue;
    const categoryId = ensureCategory(db, nextCategoryName);
    update.run(categoryId, tool.id);
    changed += 1;
  }

  return changed;
}

function dedupeToolsByNormalizedUrl() {
  const duplicateGroups = db.prepare(`
    SELECT normalized_url
    FROM tool
    WHERE normalized_url IS NOT NULL AND normalized_url != ''
    GROUP BY normalized_url
    HAVING COUNT(*) > 1
  `).all();

  const getTools = db.prepare('SELECT * FROM tool WHERE normalized_url = ? ORDER BY id ASC');
  const getTags = db.prepare(`
    SELECT tag.name
    FROM tool_tag
    JOIN tag ON tag.id = tool_tag.tag_id
    WHERE tool_tag.tool_id = ?
  `);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tag (name) VALUES (?)');
  const getTag = db.prepare('SELECT id FROM tag WHERE name = ?');
  const linkTag = db.prepare('INSERT OR IGNORE INTO tool_tag (tool_id, tag_id) VALUES (?, ?)');
  const updateKeep = db.prepare(`
    UPDATE tool
    SET click_count = ?,
        icon_url = CASE WHEN icon_url = '' THEN ? ELSE icon_url END,
        seo_keywords = TRIM(seo_keywords || ' ' || ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const removeTool = db.prepare('DELETE FROM tool WHERE id = ?');

  let removed = 0;
  const transaction = db.transaction(() => {
    for (const group of duplicateGroups) {
      const tools = getTools.all(group.normalized_url);
      const keep = tools[0];
      const duplicates = tools.slice(1);
      let clickCount = keep.click_count || 0;
      let fallbackIcon = '';
      let extraKeywords = '';

      for (const duplicate of duplicates) {
        clickCount += duplicate.click_count || 0;
        if (!fallbackIcon && duplicate.icon_url) fallbackIcon = duplicate.icon_url;
        if (duplicate.seo_keywords) extraKeywords += ` ${duplicate.seo_keywords}`;

        const tags = getTags.all(duplicate.id).map((row) => row.name);
        for (const tag of tags) {
          insertTag.run(tag);
          const tagRow = getTag.get(tag);
          linkTag.run(keep.id, tagRow.id);
        }

        removeTool.run(duplicate.id);
        removed += 1;
      }

      updateKeep.run(clickCount, fallbackIcon, extraKeywords.trim(), keep.id);
    }
  });

  transaction();
  return removed;
}

function createUniqueIndexes() {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_normalized_url_unique ON tool(normalized_url)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_name_unique ON tool(name)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_name_lower_unique ON tool(lower(name))');
}

function compactIds() {
  const categories = db.prepare('SELECT id, name FROM category ORDER BY sort_order ASC, id ASC').all();
  const mapping = categories.map((category, index) => ({
    oldId: category.id,
    newId: index + 1,
    name: category.name
  }));

  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    const updateCategory = db.prepare('UPDATE category SET id = ? WHERE id = ?');
    const updateTool = db.prepare('UPDATE tool SET category_id = ? WHERE category_id = ?');

    for (const item of mapping) {
      updateCategory.run(-item.newId, item.oldId);
      updateTool.run(-item.newId, item.oldId);
    }
    for (const item of mapping) {
      updateCategory.run(item.newId, -item.newId);
      updateTool.run(item.newId, -item.newId);
    }

    const maxId = mapping.length;
    db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'category'").run(maxId);
    const updateSort = db.prepare('UPDATE category SET sort_order = ? WHERE id = ?');
    for (const item of mapping) {
      updateSort.run(item.newId * 10, item.newId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }

  return mapping.filter((item) => item.oldId !== item.newId);
}

function main() {
  const normalizedChanged = updateNormalizedUrls();
  const duplicateToolsRemoved = dedupeToolsByNormalizedUrl();
  const reclassified = reclassifyTools();
  const compacted = compactCategoryIds ? compactIds() : [];
  createUniqueIndexes();

  console.log({
    normalized_url_updated: normalizedChanged,
    duplicate_tools_removed: duplicateToolsRemoved,
    tools_reclassified: reclassified,
    category_ids_compacted: compacted.length,
    compacted
  });
}

main();

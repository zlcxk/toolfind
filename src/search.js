const { db } = require('./db');

const FTS_SPECIAL = /["'^:(){}[\]!*+\-~<>]/g;

function buildFtsQuery(input) {
  const normalized = String(input || '')
    .trim()
    .replace(FTS_SPECIAL, ' ')
    .replace(/\s+/g, ' ');

  if (!normalized) return '';
  return normalized.split(' ').map((part) => `${part}*`).join(' OR ');
}

function calculateScore(bm25Score, tool) {
  const relevance = 1 / (Math.abs(bm25Score) + 1);
  const manualWeight = Number(tool.weight || 0) / 100;
  const clickBoost = Math.log10(Number(tool.click_count || 0) + 1) / 5;
  return (0.62 * relevance) + (0.28 * manualWeight) + (0.10 * clickBoost);
}

function searchTools(keyword) {
  const ftsQuery = buildFtsQuery(keyword);
  if (!ftsQuery) return { total: 0, groups: [], recommendations: getRecommendations() };

  let matches = [];
  try {
    matches = db.prepare(`
      SELECT rowid AS id, bm25(tool_fts, 8.0, 2.5, 8.0, 2.0, 1.0) AS bm25_score
      FROM tool_fts
      WHERE tool_fts MATCH ?
      ORDER BY bm25_score ASC
      LIMIT 200
    `).all(ftsQuery);
  } catch (error) {
    matches = [];
  }

  if (matches.length === 0) {
    const likeKeyword = `%${String(keyword).trim()}%`;
    matches = db.prepare(`
      SELECT tool.id, -1.0 AS bm25_score
      FROM tool
      JOIN category ON category.id = tool.category_id
      WHERE tool.status = 1
        AND (
          tool.name LIKE ?
          OR tool.description LIKE ?
          OR tool.seo_keywords LIKE ?
          OR category.name LIKE ?
        )
      LIMIT 200
    `).all(likeKeyword, likeKeyword, likeKeyword, likeKeyword);
  }

  if (matches.length === 0) {
    return { total: 0, groups: [], recommendations: getRecommendations() };
  }

  const scoreById = new Map(matches.map((item) => [item.id, item.bm25_score]));
  const ids = matches.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(',');
  const tools = db.prepare(`
    SELECT
      tool.*,
      category.name AS category_name,
      category.color AS category_color,
      category.sort_order AS category_sort_order,
      GROUP_CONCAT(DISTINCT tag.name) AS tags
    FROM tool
    JOIN category ON category.id = tool.category_id
    LEFT JOIN tool_tag ON tool_tag.tool_id = tool.id
    LEFT JOIN tag ON tag.id = tool_tag.tag_id
    WHERE tool.status = 1 AND tool.id IN (${placeholders})
    GROUP BY tool.id
  `).all(...ids);

  const ranked = tools.map((tool) => {
    const finalScore = calculateScore(scoreById.get(tool.id) ?? 0, tool);
    return {
      id: tool.id,
      name: tool.name,
      url: tool.url,
      description: tool.description,
      category_id: tool.category_id,
      category_name: tool.category_name,
      category_color: tool.category_color,
      icon_url: tool.icon_url,
      tags: tool.tags ? tool.tags.split(',').filter(Boolean) : [],
      click_count: tool.click_count,
      score: finalScore
    };
  }).sort((a, b) => b.score - a.score);

  const groupsByCategory = new Map();
  for (const tool of ranked) {
    if (!groupsByCategory.has(tool.category_id)) {
      groupsByCategory.set(tool.category_id, {
        category_id: tool.category_id,
        category_name: tool.category_name,
        category_color: tool.category_color,
        max_score: tool.score,
        tools: []
      });
    }
    groupsByCategory.get(tool.category_id).tools.push(tool);
  }

  const groups = [...groupsByCategory.values()]
    .sort((a, b) => b.max_score - a.max_score)
    .map(({ max_score, ...group }) => group);

  return {
    total: ranked.length,
    groups,
    recommendations: ranked.length ? [] : getRecommendations()
  };
}

function getRecommendations(limit = 6) {
  return db.prepare(`
    SELECT
      tool.id,
      tool.name,
      tool.url,
      tool.description,
      tool.icon_url,
      tool.click_count,
      category.name AS category_name,
      category.color AS category_color
    FROM tool
    JOIN category ON category.id = tool.category_id
    WHERE tool.status = 1
    ORDER BY tool.click_count DESC, tool.weight DESC, tool.created_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  searchTools,
  getRecommendations
};

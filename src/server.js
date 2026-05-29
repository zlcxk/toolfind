require('dotenv').config();

const path = require('path');
const express = require('express');
const { db, syncToolTags, getToolTags } = require('./db');
const { searchTools, getRecommendations } = require('./search');

const app = express();
const requestedPort = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const fallbackPorts = [3000, 5173, 8080, 8787, 9000].filter((item, index, list) => (
  Number.isInteger(item) && list.indexOf(item) === index
));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function sendOk(res, data = {}) {
  res.json({ code: 0, data });
}

function sendError(res, status, message) {
  res.status(status).json({ code: status, message });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, encoded] = header.split(' ');
  if (type === 'Basic' && encoded) {
    const [user, password] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === (process.env.ADMIN_USER || 'admin') && password === (process.env.ADMIN_PASSWORD || 'change-me')) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="ToolFind Admin"');
  return sendError(res, 401, 'Authentication required');
}

function validateToolPayload(body) {
  const errors = [];
  if (!body.name || String(body.name).trim().length > 50) errors.push('工具名称必填，且最多 50 字');
  try {
    const url = new URL(body.url);
    if (!['http:', 'https:'].includes(url.protocol)) errors.push('工具URL必须是 http 或 https');
  } catch {
    errors.push('工具URL格式不正确');
  }
  if (!body.description || String(body.description).trim().length > 120) errors.push('简短描述必填，且最多 120 字');
  if (!Number.isInteger(Number(body.category_id))) errors.push('所属分类必填');
  const weight = Number(body.weight ?? 50);
  if (weight < 0 || weight > 100) errors.push('权重必须在 0-100 之间');
  return errors;
}

app.get('/api/v1/search', (req, res) => {
  const keyword = String(req.query.q || '').trim();
  const result = searchTools(keyword);
  db.prepare('INSERT INTO search_log (keyword, result_count) VALUES (?, ?)').run(keyword || '(empty)', result.total);
  sendOk(res, {
    keyword,
    total: result.total,
    groups: result.groups,
    recommendations: result.recommendations
  });
});

app.post('/api/v1/click', (req, res) => {
  const toolId = Number(req.body.tool_id);
  if (!Number.isInteger(toolId)) return sendError(res, 400, 'tool_id is required');
  db.prepare('UPDATE tool SET click_count = click_count + 1 WHERE id = ?').run(toolId);
  db.prepare('INSERT INTO click_log (tool_id, keyword) VALUES (?, ?)').run(toolId, String(req.body.keyword || ''));
  sendOk(res);
});

app.get('/api/v1/hot-keywords', (req, res) => {
  const rows = db.prepare(`
    SELECT keyword, COUNT(*) AS count
    FROM search_log
    WHERE keyword != '(empty)' AND created_at >= datetime('now', '-7 day')
    GROUP BY keyword
    ORDER BY count DESC
    LIMIT 10
  `).all();
  sendOk(res, rows);
});

app.get('/api/v1/recommendations', (req, res) => {
  sendOk(res, getRecommendations());
});

app.use('/api/v1/admin', requireAdmin);

app.get('/api/v1/admin/stats', (req, res) => {
  const summary = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tool) AS tool_count,
      (SELECT COUNT(*) FROM tool WHERE status = 1) AS active_tool_count,
      (SELECT COUNT(*) FROM search_log WHERE date(created_at) = date('now')) AS today_search_count,
      (SELECT COUNT(*) FROM search_log WHERE result_count = 0) AS empty_search_count
  `).get();
  const hotKeywords = db.prepare(`
    SELECT keyword, COUNT(*) AS count
    FROM search_log
    WHERE keyword != '(empty)'
    GROUP BY keyword
    ORDER BY count DESC
    LIMIT 10
  `).all();
  const emptyKeywords = db.prepare(`
    SELECT keyword, COUNT(*) AS count
    FROM search_log
    WHERE result_count = 0 AND keyword != '(empty)'
    GROUP BY keyword
    ORDER BY count DESC
    LIMIT 20
  `).all();
  sendOk(res, { summary, hotKeywords, emptyKeywords });
});

app.get('/api/v1/admin/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM category ORDER BY sort_order ASC, id ASC').all();
  sendOk(res, rows);
});

app.post('/api/v1/admin/categories', (req, res) => {
  if (!req.body.name) return sendError(res, 400, '分类名称必填');
  const info = db.prepare(`
    INSERT INTO category (name, sort_order, color, description)
    VALUES (?, ?, ?, ?)
  `).run(
    String(req.body.name).trim(),
    Number(req.body.sort_order || 0),
    req.body.color || '#2563eb',
    req.body.description || ''
  );
  sendOk(res, { id: info.lastInsertRowid });
});

app.put('/api/v1/admin/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`
    UPDATE category
    SET name = ?, sort_order = ?, color = ?, description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(req.body.name || '').trim(),
    Number(req.body.sort_order || 0),
    req.body.color || '#2563eb',
    req.body.description || '',
    id
  );
  db.prepare('UPDATE tool SET updated_at = CURRENT_TIMESTAMP WHERE category_id = ?').run(id);
  sendOk(res);
});

app.delete('/api/v1/admin/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const count = db.prepare('SELECT COUNT(*) AS count FROM tool WHERE category_id = ?').get(id).count;
  if (count > 0) return sendError(res, 409, '该分类下仍有工具，请先转移或删除');
  db.prepare('DELETE FROM category WHERE id = ?').run(id);
  sendOk(res);
});

app.get('/api/v1/admin/tags', (req, res) => {
  sendOk(res, db.prepare('SELECT * FROM tag ORDER BY name ASC').all());
});

app.get('/api/v1/admin/tools', (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.page_size || 20), 1), 100);
  const filters = [];
  const params = [];
  if (req.query.category_id) {
    filters.push('tool.category_id = ?');
    params.push(Number(req.query.category_id));
  }
  if (req.query.status !== undefined && req.query.status !== '') {
    filters.push('tool.status = ?');
    params.push(Number(req.query.status));
  }
  if (req.query.keyword) {
    filters.push('tool.name LIKE ?');
    params.push(`%${req.query.keyword}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM tool ${where}`).get(...params).count;
  const rows = db.prepare(`
    SELECT tool.*, category.name AS category_name, category.color AS category_color
    FROM tool
    JOIN category ON category.id = tool.category_id
    ${where}
    ORDER BY tool.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize).map((tool) => ({
    ...tool,
    tags: getToolTags(tool.id)
  }));
  sendOk(res, { total, page, page_size: pageSize, items: rows });
});

app.get('/api/v1/admin/tools/:id', (req, res) => {
  const tool = db.prepare('SELECT * FROM tool WHERE id = ?').get(Number(req.params.id));
  if (!tool) return sendError(res, 404, '工具不存在');
  sendOk(res, { ...tool, tags: getToolTags(tool.id) });
});

app.post('/api/v1/admin/tools', (req, res) => {
  const errors = validateToolPayload(req.body);
  if (errors.length) return sendError(res, 400, errors.join('；'));
  try {
    const info = db.prepare(`
      INSERT INTO tool (name, url, description, category_id, status, weight, icon_url, seo_keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(req.body.name).trim(),
      String(req.body.url).trim(),
      String(req.body.description).trim(),
      Number(req.body.category_id),
      Number(req.body.status ?? 1),
      Number(req.body.weight ?? 50),
      String(req.body.icon_url || '').trim(),
      String(req.body.seo_keywords || '').trim()
    );
    syncToolTags(Number(info.lastInsertRowid), req.body.tags);
    sendOk(res, { id: info.lastInsertRowid });
  } catch (error) {
    sendError(res, 409, '工具名称或 URL 可能已存在');
  }
});

app.put('/api/v1/admin/tools/:id', (req, res) => {
  const id = Number(req.params.id);
  const errors = validateToolPayload(req.body);
  if (errors.length) return sendError(res, 400, errors.join('；'));
  try {
    db.prepare(`
      UPDATE tool
      SET name = ?, url = ?, description = ?, category_id = ?, status = ?, weight = ?,
          icon_url = ?, seo_keywords = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      String(req.body.name).trim(),
      String(req.body.url).trim(),
      String(req.body.description).trim(),
      Number(req.body.category_id),
      Number(req.body.status ?? 1),
      Number(req.body.weight ?? 50),
      String(req.body.icon_url || '').trim(),
      String(req.body.seo_keywords || '').trim(),
      id
    );
    syncToolTags(id, req.body.tags);
    sendOk(res);
  } catch (error) {
    sendError(res, 409, '工具名称或 URL 可能已存在');
  }
});

app.patch('/api/v1/admin/tools/:id/status', (req, res) => {
  db.prepare('UPDATE tool SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(Number(req.body.status), Number(req.params.id));
  sendOk(res);
});

app.delete('/api/v1/admin/tools/:id', (req, res) => {
  db.prepare('DELETE FROM tool WHERE id = ?').run(Number(req.params.id));
  sendOk(res);
});

function listenWithFallback(index = 0) {
  const ports = [requestedPort, ...fallbackPorts].filter((item, itemIndex, list) => (
    Number.isInteger(item) && item > 0 && item < 65536 && list.indexOf(item) === itemIndex
  ));
  const port = ports[index];

  const server = app.listen(port, host, () => {
    console.log(`ToolFind is running at http://${host}:${port}`);
  });

  server.on('error', (error) => {
    if ((error.code === 'EACCES' || error.code === 'EADDRINUSE') && index < ports.length - 1) {
      console.warn(`Port ${host}:${port} is unavailable (${error.code}), trying ${ports[index + 1]}...`);
      listenWithFallback(index + 1);
      return;
    }

    console.error(`Unable to start ToolFind on ${host}:${port}`);
    console.error(error.message);
    process.exit(1);
  });
}

listenWithFallback();

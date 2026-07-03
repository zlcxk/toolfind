const { db } = require('./db');

function boolEnv(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function requestWithTimeout(url, method, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'ToolFindHealthCheck/1.0 (+https://toolfind.local)',
        accept: '*/*'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function networkFailureMessage(error) {
  if (error.name === 'AbortError') return '请求超时，可能为海外站点';
  return error.message || '网络不可达，可能为海外站点';
}

async function checkUrl(url) {
  try {
    let response = await requestWithTimeout(url, 'HEAD');
    if ([405, 403].includes(response.status)) {
      response = await requestWithTimeout(url, 'GET');
    }
    if (response.ok || (response.status >= 300 && response.status < 400)) {
      return { ok: true, message: `HTTP ${response.status}` };
    }
    return { ok: false, message: `HTTP ${response.status}` };
  } catch (error) {
    try {
      const response = await requestWithTimeout(url, 'GET');
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return { ok: true, message: `HTTP ${response.status}` };
      }
      return { ok: false, message: `HTTP ${response.status}` };
    } catch (retryError) {
      return { ok: false, overseas: true, message: networkFailureMessage(retryError) };
    }
  }
}

async function runHealthCheck({ includeInactive = false } = {}) {
  const tools = db.prepare(`
    SELECT id, name, url, status
    FROM tool
    ${includeInactive ? '' : 'WHERE status = 1'}
    ORDER BY id ASC
  `).all();

  const result = {
    total: tools.length,
    ok: 0,
    down: 0,
    overseas: 0,
    checked_at: new Date().toISOString()
  };

  const update = db.prepare(`
    UPDATE tool
    SET status = ?,
        last_checked_at = CURRENT_TIMESTAMP,
        last_health_status = ?,
        last_health_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const tool of tools) {
    const health = await checkUrl(tool.url);
    if (health.ok) {
      result.ok += 1;
      update.run(tool.status, 'ok', health.message, tool.id);
    } else if (health.overseas) {
      result.overseas += 1;
      update.run(tool.status, 'overseas', health.message.slice(0, 240), tool.id);
    } else {
      result.down += 1;
      update.run(0, 'down', health.message.slice(0, 240), tool.id);
    }
  }

  return result;
}

function scheduleHealthCheck() {
  if (!boolEnv(process.env.HEALTH_CHECK_ENABLED, true)) return;

  const hours = Math.max(Number(process.env.HEALTH_CHECK_INTERVAL_HOURS || 24), 1);
  const intervalMs = hours * 60 * 60 * 1000;

  if (boolEnv(process.env.HEALTH_CHECK_ON_START, false)) {
    setTimeout(() => {
      runHealthCheck().then((result) => {
        console.log(`Health check finished: ${result.ok} ok, ${result.down} down, ${result.overseas} overseas`);
      }).catch((error) => {
        console.error(`Health check failed: ${error.message}`);
      });
    }, 5000);
  }

  setInterval(() => {
    runHealthCheck().then((result) => {
      console.log(`Health check finished: ${result.ok} ok, ${result.down} down, ${result.overseas} overseas`);
    }).catch((error) => {
      console.error(`Health check failed: ${error.message}`);
    });
  }, intervalMs).unref();
}

module.exports = {
  runHealthCheck,
  scheduleHealthCheck
};

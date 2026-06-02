function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function pickIconFromHtml(html, baseUrl) {
  const linkPattern = /<link\b[^>]*>/gi;
  const links = html.match(linkPattern) || [];
  const candidates = [];

  for (const link of links) {
    const rel = (link.match(/\brel=["']?([^"'>\s]+)/i) || [])[1] || '';
    const href = (link.match(/\bhref=["']([^"']+)["']/i) || [])[1] || '';
    if (!href) continue;

    const normalizedRel = rel.toLowerCase();
    if (normalizedRel.includes('icon') || normalizedRel.includes('apple-touch-icon')) {
      try {
        const iconUrl = new URL(href, baseUrl);
        if (iconUrl.protocol === 'http:' || iconUrl.protocol === 'https:') {
          candidates.push(iconUrl.toString());
        }
      } catch {
        // Ignore malformed icon links.
      }
    }
  }

  candidates.sort((a, b) => {
    const aScore = a.includes('apple') ? 2 : a.includes('svg') ? 1 : 0;
    const bScore = b.includes('apple') ? 2 : b.includes('svg') ? 1 : 0;
    return bScore - aScore;
  });

  return candidates[0] || '';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'ToolFindBot/1.0 (+https://toolfind.local)',
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFavicon(siteUrl) {
  if (!isHttpUrl(siteUrl)) {
    throw new Error('URL 格式不正确');
  }

  const url = new URL(siteUrl);
  const origin = url.origin;

  try {
    const response = await fetchWithTimeout(siteUrl, {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml' }
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('text/html')) {
      const html = await response.text();
      const icon = pickIconFromHtml(html, response.url || siteUrl);
      if (icon) return icon;
    }
  } catch {
    // Fall back to the conventional favicon path.
  }

  const fallback = `${origin}/favicon.ico`;
  const response = await fetchWithTimeout(fallback, { method: 'HEAD' }, 5000);
  if (response.ok) return fallback;

  throw new Error('未找到可用图标，可手动填写图标链接');
}

module.exports = {
  discoverFavicon,
  isHttpUrl
};

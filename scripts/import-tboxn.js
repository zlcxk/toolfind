require('dotenv').config();

const { db, syncToolTags } = require('../src/db');
const { normalizeUrl } = require('../src/url-utils');
const { inferCategoryName, ensureCategory } = require('../src/taxonomy');

const SOURCE_URL = 'https://www.tboxn.com/';
const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find((item) => item.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 0;
const EXCLUDED_KEYWORDS = ['破解', '激活', '盗版', 'z-library', 'zlibrary', '备案号', 'ICP备', '现金红包', '接码', '预测市场', '博彩'];

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(html, name) {
  const pattern = new RegExp(`\\b${name}=["']([^"']+)["']`, 'i');
  return (html.match(pattern) || [])[1] || '';
}

function absolutize(url, base = SOURCE_URL) {
  try {
    return new URL(url, base).toString();
  } catch {
    return '';
  }
}

function decodeTboxGoUrl(url) {
  try {
    const parsed = new URL(url, SOURCE_URL);
    if (!parsed.pathname.includes('/go/')) return url;

    const encoded = parsed.searchParams.get('url');
    if (!encoded) return '';

    const decoded = decodeURIComponent(encoded);
    const target = Buffer.from(decoded, 'base64').toString('utf8');
    return /^https?:\/\//i.test(target) ? target.replace(/&amp;/g, '&').trim() : '';
  } catch {
    return '';
  }
}

function isUsefulToolUrl(url) {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.includes('tboxn.com')) return false;
  const blocked = [
    'javascript:',
    'mailto:',
    'weibo.com',
    'qq.com'
  ];
  return !blocked.some((item) => url.includes(item));
}

function extractCards(html) {
  const cards = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const rawHref = match[1];
    if (!rawHref.includes('/go/?url=')) continue;
    const body = match[2];
    const absoluteUrl = absolutize(rawHref);
    const url = decodeTboxGoUrl(absoluteUrl);
    if (!isUsefulToolUrl(url)) continue;

    const title =
      attr(body, 'title') ||
      stripHtml((body.match(/class=["'][^"']*(?:overflowClip_1|sites-title|card-title|text-sm)[^"']*["'][^>]*>([\s\S]*?)</i) || [])[1]) ||
      stripHtml((body.match(/<(?:h3|h4|strong)\b[^>]*>([\s\S]*?)<\/(?:h3|h4|strong)>/i) || [])[1]) ||
      stripHtml(body).split(' ').slice(0, 2).join(' ');
    const text = stripHtml(body);
    const description = text.replace(title, '').replace(/^#\s*\S+\s*/g, '').trim() || `${title} - 从 Tbox 导航导入的在线工具。`;
    const icon = absolutize(attr(body, 'src') || attr(body, 'data-src') || attr(body, 'data-original'));

    if (!title || title.length > 60) continue;
    if (title.startsWith('#')) continue;
    if (text.length < 2) continue;
    if (EXCLUDED_KEYWORDS.some((word) => `${title} ${description} ${url}`.toLowerCase().includes(word.toLowerCase()))) continue;

    cards.push({
      name: title.slice(0, 50),
      url,
      description: description.slice(0, 120),
      icon_url: icon,
      category: inferCategoryName(title, description),
      seo_keywords: `${title} ${description} tbox 在线工具`,
      tags: ['Tbox导入']
    });
  }

  const seen = new Set();
  return cards.filter((item) => {
    const key = item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i')
  ];
  for (const pattern of patterns) {
    const found = html.match(pattern);
    if (found) return stripHtml(found[1]);
  }
  return '';
}

function extractDetailUrls(html) {
  const urls = new Set();
  const pattern = /https:\/\/www\.tboxn\.com\/sites\/\d+\.html/g;
  for (const match of html.match(pattern) || []) {
    urls.add(match);
  }
  return [...urls];
}

function extractBreadcrumbCategory(html) {
  const nav = (html.match(/aria-label=["']breadcrumb["'][^>]*>([\s\S]*?)<\/nav>/i) || [])[1] || '';
  const labels = [...nav.matchAll(/<a\b[^>]*href=["'][^"']*\/favorites\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((item) => item && !['首页', '热门工具'].includes(item));
  return labels[labels.length - 1] || '';
}

function extractToolFromDetail(html, pageUrl) {
  const goHref = (html.match(/<a\b[^>]*href=["']([^"']*\/go\/\?url=[^"']+)["'][^>]*class=["'][^"']*btn[^"']*["'][^>]*>/i) || [])[1] ||
    (html.match(/<a\b[^>]*class=["'][^"']*btn[^"']*["'][^>]*href=["']([^"']*\/go\/\?url=[^"']+)["'][^>]*>/i) || [])[1] ||
    (html.match(/href=["']([^"']*\/go\/\?url=[^"']+)["']/i) || [])[1] ||
    '';
  const url = decodeTboxGoUrl(absolutize(goHref, pageUrl));
  if (!isUsefulToolUrl(url)) return null;

  const goAnchor = html.match(new RegExp(`<a\\b[^>]*href=["'][^"']*${goHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>`, 'i'))?.[0] || '';
  const sourceCategory = extractBreadcrumbCategory(html);
  const goTitle = attr(goAnchor, 'title');
  const name =
    (['打开网站', '直达'].includes(goTitle) ? '' : goTitle) ||
    stripHtml((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) ||
    extractMeta(html, 'og:title').replace(/\s*\|.*$/, '').replace(/网址：.*$/, '') ||
    new URL(url).hostname.replace(/^www\./, '');
  const shortDescription =
    stripHtml((html.match(/<p class=["'][^"']*mb-2[^"']*["']>([\s\S]*?)<\/p>/i) || [])[1]) ||
    extractMeta(html, 'description') ||
    `${name} - 从 Tbox 导航导入的在线工具。`;
  const icon = extractMeta(html, 'og:image') || '';
  const description = shortDescription.slice(0, 120);

  if (EXCLUDED_KEYWORDS.some((word) => `${name} ${description} ${url}`.toLowerCase().includes(word.toLowerCase()))) {
    return null;
  }

  return {
    name: name.slice(0, 50),
    url,
    description,
    icon_url: icon,
    category: inferCategoryName(name, description, sourceCategory),
    seo_keywords: `${name} ${description} ${sourceCategory} tbox 在线工具`,
    tags: ['Tbox导入', sourceCategory].filter(Boolean)
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'ToolFindImporter/1.0',
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) throw new Error(`Fetch failed ${url}: HTTP ${response.status}`);
  return response.text();
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = null;
        console.warn(`Skip ${items[index]}: ${error.message}`);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function insertTool(tool) {
  const normalizedUrl = normalizeUrl(tool.url);
  const exists = db.prepare('SELECT id FROM tool WHERE normalized_url = ? OR url = ? OR lower(name) = lower(?)')
    .get(normalizedUrl, tool.url, tool.name);
  if (exists) return { skipped: true };

  const categoryId = ensureCategory(db, tool.category);
  const info = db.prepare(`
    INSERT INTO tool (name, url, normalized_url, description, category_id, status, weight, icon_url, seo_keywords)
    VALUES (?, ?, ?, ?, ?, 1, 50, ?, ?)
  `).run(tool.name, tool.url, normalizedUrl, tool.description, categoryId, tool.icon_url, tool.seo_keywords);

  syncToolTags(Number(info.lastInsertRowid), tool.tags);
  return { inserted: true };
}

async function main() {
  const html = await fetchText(SOURCE_URL);
  const detailUrls = extractDetailUrls(html);
  const selectedDetailUrls = LIMIT > 0 ? detailUrls.slice(0, LIMIT) : detailUrls;
  const detailTools = await mapWithConcurrency(selectedDetailUrls, 6, async (url) => {
    const detailHtml = await fetchText(url);
    return extractToolFromDetail(detailHtml, url);
  });
  const tools = [...extractCards(html), ...detailTools.filter(Boolean)].filter((item, index, list) => (
    list.findIndex((candidate) => candidate.url === item.url || candidate.name === item.name) === index
  ));

  if (DRY_RUN) {
    console.log(`Found ${tools.length} candidate tools from ${SOURCE_URL}`);
    console.log(`Scanned detail pages: ${selectedDetailUrls.length}/${detailUrls.length}`);
    console.log(tools.slice(0, 20));
    return;
  }

  let inserted = 0;
  let skipped = 0;
  const transaction = db.transaction(() => {
    for (const tool of tools) {
      const result = insertTool(tool);
      if (result.inserted) inserted += 1;
      if (result.skipped) skipped += 1;
    }
  });
  transaction();

  console.log(`Tbox import finished. Inserted: ${inserted}, skipped: ${skipped}, candidates: ${tools.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

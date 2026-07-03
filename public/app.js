const params = new URLSearchParams(window.location.search);
const initialQuery = params.get('q') || '';
const route = window.location.pathname === '/tools' ? 'tools' : (initialQuery ? 'results' : 'home');

const searchForms = document.querySelectorAll('[data-search-form]');
const searchInputs = document.querySelectorAll('[data-search-input]');
const resultsRoot = document.querySelector('[data-results]');
const metaRoot = document.querySelector('[data-meta]');
const hotRoot = document.querySelector('[data-hot]');
const hotToolsRoot = document.querySelector('[data-hot-tools]');
const toolsGroupsRoot = document.querySelector('[data-tools-groups]');
const categoryTabsRoot = document.querySelector('[data-category-tabs]');
const toolsTitleRoot = document.querySelector('[data-tools-title]');
const toolsDescriptionRoot = document.querySelector('[data-tools-description]');
const toolsCountRoot = document.querySelector('[data-tools-count]');
const toolsPaginationRoot = document.querySelector('[data-tools-pagination]');
const themeToggle = document.querySelector('[data-theme-toggle]');
const hiddenTags = new Set(['Tbox导入', 'Tbox瀵煎叆']);

let toolsData = null;
let activeCategory = 'all';
let currentToolsPage = 1;
const toolsPageSize = 12;

const categoryIcons = [
  ['Windows', 'WIN'],
  ['数据库', 'DB'],
  ['网络', 'NET'],
  ['图片', '▣'],
  ['图像', '▣'],
  ['打印', '3D'],
  ['运维', 'OPS'],
  ['读书', '书'],
  ['资源', '资'],
  ['心理', '心'],
  ['购物', '购'],
  ['实用', '用'],
  ['动漫', '漫'],
  ['文档', '◫'],
  ['PDF', 'PDF'],
  ['开发', '{}'],
  ['设计', '◇'],
  ['AI', 'AI'],
  ['效率', '⚡'],
  ['SEO', '↗'],
  ['教育', '◒'],
  ['系统', '⚙'],
  ['影音', '▶'],
  ['其他', '••']
];

function setupTheme() {
  const saved = localStorage.getItem('toolfind-theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;

  themeToggle?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('toolfind-theme', next);
  });
}

setupTheme();

document.querySelectorAll('.page-view').forEach((view) => view.classList.add('hidden'));
document.getElementById(`${route}-view`)?.classList.remove('hidden');
document.querySelector('[data-nav-home]')?.classList.toggle('active', route === 'home' || route === 'results');
document.querySelector('[data-nav-tools]')?.classList.toggle('active', route === 'tools');

searchInputs.forEach((input) => {
  input.value = initialQuery;
});

searchForms.forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const searchInput = form.querySelector('[data-search-input]');
    const q = searchInput.value.trim();
    if (q) window.location.href = `/?q=${encodeURIComponent(q)}`;
  });
});

async function api(path, options) {
  const response = await fetch(path, options);
  const json = await response.json();
  if (!response.ok || json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function visibleTags(tags) {
  return (tags || []).filter((tag) => !hiddenTags.has(tag));
}

function categoryIcon(name = '') {
  const cleanName = String(name || '').trim();
  const match = categoryIcons.find(([keyword]) => cleanName.includes(keyword));
  if (match) return match[1];
  return Array.from(cleanName).slice(0, 2).join('') || '⌘';
}

function iconHtml(tool) {
  const label = categoryIcon(tool.category_name || tool.name);
  const fallback = `<span class="default-icon">${escapeHtml(label)}</span>`;
  if (tool.icon_url) {
    return `
      <span class="icon">
        ${fallback}
        <img src="${escapeHtml(tool.icon_url)}" alt="" loading="lazy" onerror="this.remove()">
      </span>
    `;
  }
  return `<span class="icon icon-default">${fallback}</span>`;
}

function healthBadge(tool) {
  if (tool.last_health_status === 'overseas') {
    return '<span class="badge overseas">海外</span>';
  }
  return '';
}

function cardHtml(tool, keyword = '') {
  const tags = [
    `<span class="badge primary-badge">${escapeHtml(tool.category_name)}</span>`,
    healthBadge(tool),
    ...visibleTags(tool.tags).slice(0, 3).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`)
  ].filter(Boolean).join('');

  return `
    <a class="tool-card" href="${escapeHtml(tool.url)}" target="_blank" rel="noopener" data-tool-id="${tool.id}" data-keyword="${escapeHtml(keyword)}">
      ${iconHtml(tool)}
      <span class="tool-card-body">
        <span class="tool-card-top">
          <h3>${escapeHtml(tool.name)}</h3>
        </span>
        <p>${escapeHtml(tool.description)}</p>
        <span class="badges">${tags}</span>
      </span>
    </a>
  `;
}

function groupHtml(group, keyword = '') {
  const id = `group-${group.category_id}`;
  return `
    <section class="group" data-category-group="${group.category_id}">
      <button class="group-title" type="button" aria-expanded="true" data-toggle="${id}">
        <span class="group-name"><span class="swatch" style="background:${escapeHtml(group.category_color)}"></span>${escapeHtml(group.category_name)}</span>
        <span>${group.tools.length} 个工具</span>
      </button>
      ${group.category_description ? `<p class="group-description">${escapeHtml(group.category_description)}</p>` : ''}
      <div class="cards" id="${id}">
        ${group.tools.map((tool) => cardHtml(tool, keyword)).join('')}
      </div>
    </section>
  `;
}

function bindToolEvents() {
  document.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.toggle);
      const collapsed = target.classList.toggle('hidden');
      button.setAttribute('aria-expanded', String(!collapsed));
    });
  });

  document.querySelectorAll('[data-tool-id]').forEach((link) => {
    link.addEventListener('click', () => {
      fetch('/api/v1/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_id: Number(link.dataset.toolId),
          keyword: link.dataset.keyword || ''
        })
      }).catch(() => {});
    });
  });
}

async function loadHotKeywords() {
  if (!hotRoot) return;
  try {
    const keywords = await api('/api/v1/hot-keywords');
    const fallback = ['图片压缩', 'JSON格式化', 'PDF压缩', '配色', '正则'];
    const list = keywords.length ? keywords.map((item) => item.keyword) : fallback;
    hotRoot.innerHTML = list.map((word) => `<button class="chip" type="button">${escapeHtml(word)}</button>`).join('');
    hotRoot.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        window.location.href = `/?q=${encodeURIComponent(button.textContent.trim())}`;
      });
    });
  } catch {
    hotRoot.innerHTML = '';
  }
}

function logoItemHtml(tool) {
  return `
    <a class="logo-item" href="${escapeHtml(tool.url)}" target="_blank" rel="noopener" data-tool-id="${tool.id}" data-keyword="hot">
      ${iconHtml(tool)}
      <span>
        <strong>${escapeHtml(tool.name)}</strong>
        <small>${escapeHtml(tool.description || tool.category_name || '')}</small>
      </span>
    </a>
  `;
}

async function loadHotTools() {
  if (!hotToolsRoot) return;
  try {
    const tools = await api('/api/v1/recommendations');
    const items = tools.concat(tools);
    hotToolsRoot.innerHTML = `<div class="marquee-track">${items.map(logoItemHtml).join('')}</div>`;
    bindToolEvents();
  } catch {
    hotToolsRoot.innerHTML = '<p class="muted">热门工具加载失败</p>';
  }
}

function allTools() {
  return (toolsData?.groups || []).flatMap((group) => group.tools);
}

function selectedGroup() {
  if (activeCategory === 'all') return null;
  return toolsData.groups.find((group) => String(group.category_id) === String(activeCategory));
}

function renderCategoryTabs(groups) {
  if (!categoryTabsRoot) return;
  categoryTabsRoot.innerHTML = [
    `<button class="category-tab active" type="button" data-filter-category="all"><span class="tab-icon">⌘</span>全部</button>`,
    ...groups.map((group) => (
      `<button class="category-tab" type="button" data-filter-category="${group.category_id}">
        <span class="tab-icon" style="color:${escapeHtml(group.category_color)}">${escapeHtml(categoryIcon(group.category_name))}</span>${escapeHtml(group.category_name)}
      </button>`
    ))
  ].join('');

  categoryTabsRoot.querySelectorAll('[data-filter-category]').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.filterCategory;
      currentToolsPage = 1;
      renderToolsGrid();
    });
  });
}

function renderPagination(total) {
  if (!toolsPaginationRoot) return;
  const pages = Math.max(Math.ceil(total / toolsPageSize), 1);
  if (pages <= 1) {
    toolsPaginationRoot.innerHTML = '';
    return;
  }

  const buttons = [];
  buttons.push(`<button type="button" ${currentToolsPage === 1 ? 'disabled' : ''} data-page="${currentToolsPage - 1}">‹</button>`);
  for (let page = 1; page <= pages; page += 1) {
    buttons.push(`<button type="button" class="${page === currentToolsPage ? 'active' : ''}" data-page="${page}">${page}</button>`);
  }
  buttons.push(`<button type="button" ${currentToolsPage === pages ? 'disabled' : ''} data-page="${currentToolsPage + 1}">›</button>`);

  toolsPaginationRoot.innerHTML = buttons.join('');
  toolsPaginationRoot.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      currentToolsPage = Number(button.dataset.page);
      renderToolsGrid();
      document.querySelector('.tools-current')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderToolsGrid() {
  if (!toolsGroupsRoot || !toolsData) return;

  const group = selectedGroup();
  const tools = group ? group.tools : allTools();
  const pages = Math.max(Math.ceil(tools.length / toolsPageSize), 1);
  currentToolsPage = Math.min(Math.max(currentToolsPage, 1), pages);
  const start = (currentToolsPage - 1) * toolsPageSize;
  const visibleTools = tools.slice(start, start + toolsPageSize);

  categoryTabsRoot?.querySelectorAll('[data-filter-category]').forEach((button) => {
    button.classList.toggle('active', button.dataset.filterCategory === String(activeCategory));
  });

  if (toolsTitleRoot) toolsTitleRoot.textContent = group ? group.category_name : '全部工具';
  if (toolsDescriptionRoot) toolsDescriptionRoot.textContent = group?.category_description || '按分类浏览全部已收录工具';
  if (toolsCountRoot) toolsCountRoot.textContent = `共 ${tools.length} 个工具`;

  toolsGroupsRoot.innerHTML = visibleTools.length
    ? `<div class="tools-grid">${visibleTools.map((tool) => cardHtml(tool)).join('')}</div>`
    : '<div class="empty">还没有可展示的工具</div>';
  renderPagination(tools.length);
  bindToolEvents();
}

async function loadToolsPage() {
  if (!toolsGroupsRoot) return;
  toolsGroupsRoot.innerHTML = '<div class="empty">正在加载工具分类...</div>';
  try {
    toolsData = await api('/api/v1/tools');
    renderCategoryTabs(toolsData.groups);
    renderToolsGrid();
  } catch (error) {
    toolsGroupsRoot.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function runSearch() {
  if (!resultsRoot || !initialQuery) return;
  metaRoot.textContent = '正在搜索...';
  try {
    const data = await api(`/api/v1/search?q=${encodeURIComponent(initialQuery)}`);
    metaRoot.textContent = `为 "${data.keyword}" 找到 ${data.total} 个相关工具`;
    if (data.groups.length) {
      resultsRoot.innerHTML = data.groups.map((group) => groupHtml(group, data.keyword)).join('');
    } else {
      resultsRoot.innerHTML = `
        <div class="empty">
          <h2>未找到相关工具</h2>
          <p>试试其他关键词，或从热门推荐里继续探索。</p>
        </div>
        <div class="cards recommendations">
          ${(data.recommendations || []).map((tool) => cardHtml(tool, data.keyword)).join('')}
        </div>
      `;
    }
    bindToolEvents();
  } catch (error) {
    metaRoot.textContent = error.message;
  }
}

loadHotKeywords();
loadHotTools();
if (route === 'tools') loadToolsPage();
if (route === 'results') runSearch();

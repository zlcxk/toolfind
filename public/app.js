const params = new URLSearchParams(window.location.search);
const initialQuery = params.get('q') || '';

const searchForms = document.querySelectorAll('[data-search-form]');
const searchInputs = document.querySelectorAll('[data-search-input]');
const resultsRoot = document.querySelector('[data-results]');
const metaRoot = document.querySelector('[data-meta]');
const hotRoot = document.querySelector('[data-hot]');

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

function iconHtml(tool) {
  if (tool.icon_url) {
    return `<span class="icon"><img src="${escapeHtml(tool.icon_url)}" alt=""></span>`;
  }
  return `<span class="icon">${escapeHtml((tool.name || '?').slice(0, 1).toUpperCase())}</span>`;
}

function cardHtml(tool, keyword) {
  const tags = [
    `<span class="badge" style="background:${escapeHtml(tool.category_color || '#e5e7eb')};color:#fff">${escapeHtml(tool.category_name)}</span>`,
    ...(tool.tags || []).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`)
  ].join('');
  return `
    <a class="tool-card" href="${escapeHtml(tool.url)}" target="_blank" rel="noopener" data-tool-id="${tool.id}" data-keyword="${escapeHtml(keyword)}">
      ${iconHtml(tool)}
      <span>
        <h3>${escapeHtml(tool.name)}</h3>
        <p>${escapeHtml(tool.description)}</p>
        <span class="badges">${tags}</span>
      </span>
    </a>
  `;
}

function groupHtml(group, keyword) {
  const id = `group-${group.category_id}`;
  return `
    <section class="group">
      <button class="group-title" type="button" aria-expanded="true" data-toggle="${id}">
        <span class="group-name"><span class="swatch" style="background:${escapeHtml(group.category_color)}"></span>${escapeHtml(group.category_name)}</span>
        <span>${group.tools.length} 个结果</span>
      </button>
      <div class="cards" id="${id}">
        ${group.tools.map((tool) => cardHtml(tool, keyword)).join('')}
      </div>
    </section>
  `;
}

function bindResultEvents() {
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
        <div class="cards">
          ${(data.recommendations || []).map((tool) => cardHtml(tool, data.keyword)).join('')}
        </div>
      `;
    }
    bindResultEvents();
  } catch (error) {
    metaRoot.textContent = error.message;
  }
}

loadHotKeywords();
runSearch();

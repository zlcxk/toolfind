let categories = [];
let editingToolId = null;
let editingCategoryId = null;
const hiddenTags = new Set(['Tbox导入']);

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const json = await response.json();
  if (!response.ok || json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data;
}

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function setView(name) {
  document.querySelectorAll('[data-view]').forEach((view) => view.classList.add('hidden'));
  document.querySelector(`[data-view="${name}"]`).classList.remove('hidden');
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.classList.toggle('active', button.dataset.nav === name);
  });
}

async function loadStats() {
  const data = await adminApi('/api/v1/admin/stats');
  document.querySelector('[data-metrics]').innerHTML = `
    <div class="metric">工具总数<strong>${data.summary.tool_count}</strong></div>
    <div class="metric">上架工具<strong>${data.summary.active_tool_count}</strong></div>
    <div class="metric">今日搜索<strong>${data.summary.today_search_count}</strong></div>
    <div class="metric">无结果搜索<strong>${data.summary.empty_search_count}</strong></div>
  `;
  document.querySelector('[data-hot-list]').innerHTML = data.hotKeywords
    .map((item) => `<tr><td>${html(item.keyword)}</td><td>${item.count}</td></tr>`)
    .join('');
  document.querySelector('[data-empty-list]').innerHTML = data.emptyKeywords
    .map((item) => `<tr><td>${html(item.keyword)}</td><td>${item.count}</td></tr>`)
    .join('');
}

async function loadCategories() {
  categories = await adminApi('/api/v1/admin/categories');
  document.querySelectorAll('[data-category-options]').forEach((select) => {
    select.innerHTML = '<option value="">全部分类</option>' + categories.map((item) => (
      `<option value="${item.id}">${html(item.name)}</option>`
    )).join('');
  });
  document.querySelector('[name="category_id"]').innerHTML = '<option value="">自动分类</option>' + categories.map((item) => (
    `<option value="${item.id}">${html(item.name)}</option>`
  )).join('');
  document.querySelector('[data-category-table]').innerHTML = categories.map((item) => `
    <tr>
      <td>${item.id}</td>
      <td><span class="badge" style="background:${html(item.color)};color:#fff">${html(item.name)}</span></td>
      <td>${item.sort_order}</td>
      <td>${html(item.description)}</td>
      <td class="row-actions">
        <button class="button secondary" data-edit-category="${item.id}">编辑</button>
        <button class="button danger" data-delete-category="${item.id}">删除</button>
      </td>
    </tr>
  `).join('');
}

function healthLabel(item) {
  if (item.last_health_status === 'ok') {
    return '<span class="badge" style="background:#dcfce7;color:#166534">正常</span>';
  }
  if (item.last_health_status === 'down') {
    const title = item.last_health_error ? ` title="${html(item.last_health_error)}"` : '';
    return `<span class="badge" style="background:#fee2e2;color:#991b1b"${title}>不可访问</span>`;
  }
  return '<span class="badge">未检测</span>';
}

function visibleTags(tags) {
  return (tags || []).filter((tag) => !hiddenTags.has(tag));
}

async function loadTools() {
  const keyword = document.querySelector('[data-tool-filter-keyword]').value.trim();
  const category = document.querySelector('[data-tool-filter-category]').value;
  const status = document.querySelector('[data-tool-filter-status]').value;
  const query = new URLSearchParams({ page_size: '100' });
  if (keyword) query.set('keyword', keyword);
  if (category) query.set('category_id', category);
  if (status !== '') query.set('status', status);
  const data = await adminApi(`/api/v1/admin/tools?${query}`);
  document.querySelector('[data-tool-table]').innerHTML = data.items.map((item) => `
    <tr>
      <td>${item.id}</td>
      <td>${html(item.name)}</td>
      <td>${html(item.category_name)}</td>
      <td>${item.status ? '上架' : '下架'}</td>
      <td>${healthLabel(item)}</td>
      <td>${item.click_count}</td>
      <td>${item.weight}</td>
      <td>${visibleTags(item.tags).map((tag) => `<span class="badge">${html(tag)}</span>`).join(' ')}</td>
      <td class="row-actions">
        <button class="button secondary" data-edit-tool="${item.id}">编辑</button>
        <button class="button secondary" data-toggle-tool="${item.id}" data-status="${item.status ? 0 : 1}">${item.status ? '下架' : '上架'}</button>
        <button class="button danger" data-delete-tool="${item.id}">删除</button>
      </td>
    </tr>
  `).join('');
}

function resetToolForm() {
  editingToolId = null;
  document.querySelector('[data-tool-form]').reset();
  document.querySelector('[name="status"]').value = '1';
  document.querySelector('[name="weight"]').value = '50';
}

function resetCategoryForm() {
  editingCategoryId = null;
  document.querySelector('[data-category-form]').reset();
  document.querySelector('[name="color"]').value = '#2563eb';
}

function toolFormPayload() {
  const form = new FormData(document.querySelector('[data-tool-form]'));
  return {
    name: form.get('name'),
    url: form.get('url'),
    description: form.get('description'),
    category_id: Number(form.get('category_id')),
    status: Number(form.get('status')),
    weight: Number(form.get('weight')),
    icon_url: form.get('icon_url'),
    seo_keywords: form.get('seo_keywords'),
    tags: String(form.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean)
  };
}

function categoryFormPayload() {
  const form = new FormData(document.querySelector('[data-category-form]'));
  return {
    name: form.get('name'),
    sort_order: Number(form.get('sort_order') || 0),
    color: form.get('color'),
    description: form.get('description')
  };
}

async function fetchIcon() {
  const form = document.querySelector('[data-tool-form]');
  const url = form.elements.url.value.trim();
  if (!url) {
    alert('请先填写工具 URL');
    return;
  }
  const button = document.querySelector('[data-fetch-icon]');
  button.disabled = true;
  button.textContent = '获取中...';
  try {
    const data = await adminApi('/api/v1/admin/fetch-icon', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    form.elements.icon_url.value = data.icon_url;
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '自动获取图标';
  }
}

async function runManualHealthCheck() {
  if (!confirm('将检测所有上架工具链接，不可访问的工具会自动下架。是否继续？')) return;
  const button = document.querySelector('[data-run-health-check]');
  button.disabled = true;
  button.textContent = '检测中...';
  try {
    const result = await adminApi('/api/v1/admin/health-check', {
      method: 'POST',
      body: JSON.stringify({ include_inactive: false })
    });
    await Promise.all([loadTools(), loadStats()]);
    alert(`检测完成：正常 ${result.ok} 个，不可访问 ${result.down} 个`);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '检测链接';
  }
}

async function boot() {
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.nav));
  });

  document.querySelector('[data-tool-filter]').addEventListener('submit', (event) => {
    event.preventDefault();
    loadTools().catch(alert);
  });

  document.querySelector('[data-tool-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = toolFormPayload();
    const path = editingToolId ? `/api/v1/admin/tools/${editingToolId}` : '/api/v1/admin/tools';
    const method = editingToolId ? 'PUT' : 'POST';
    await adminApi(path, { method, body: JSON.stringify(payload) });
    resetToolForm();
    await Promise.all([loadTools(), loadStats()]);
    alert('已保存');
  });

  document.querySelector('[data-reset-tool]').addEventListener('click', resetToolForm);
  document.querySelector('[data-fetch-icon]').addEventListener('click', fetchIcon);
  document.querySelector('[data-run-health-check]').addEventListener('click', runManualHealthCheck);

  document.querySelector('[data-category-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = categoryFormPayload();
    const path = editingCategoryId ? `/api/v1/admin/categories/${editingCategoryId}` : '/api/v1/admin/categories';
    const method = editingCategoryId ? 'PUT' : 'POST';
    await adminApi(path, { method, body: JSON.stringify(payload) });
    resetCategoryForm();
    await Promise.all([loadCategories(), loadTools()]);
    alert('已保存');
  });

  document.querySelector('[data-reset-category]').addEventListener('click', resetCategoryForm);

  document.addEventListener('click', async (event) => {
    const editTool = event.target.closest('[data-edit-tool]');
    const deleteTool = event.target.closest('[data-delete-tool]');
    const toggleTool = event.target.closest('[data-toggle-tool]');
    const editCategory = event.target.closest('[data-edit-category]');
    const deleteCategory = event.target.closest('[data-delete-category]');

    if (editTool) {
      const data = await adminApi(`/api/v1/admin/tools/${editTool.dataset.editTool}`);
      editingToolId = data.id;
      const form = document.querySelector('[data-tool-form]');
      Object.entries(data).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = Array.isArray(value) ? value.join(',') : value;
      });
      form.elements.tags.value = visibleTags(data.tags).join(',');
      setView('tools');
    }
    if (deleteTool && confirm('确定删除这个工具？')) {
      await adminApi(`/api/v1/admin/tools/${deleteTool.dataset.deleteTool}`, { method: 'DELETE' });
      await Promise.all([loadTools(), loadStats()]);
    }
    if (toggleTool) {
      await adminApi(`/api/v1/admin/tools/${toggleTool.dataset.toggleTool}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: Number(toggleTool.dataset.status) })
      });
      await loadTools();
    }
    if (editCategory) {
      const item = categories.find((category) => String(category.id) === editCategory.dataset.editCategory);
      editingCategoryId = item.id;
      const form = document.querySelector('[data-category-form]');
      Object.entries(item).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = value ?? '';
      });
    }
    if (deleteCategory && confirm('确定删除这个分类？')) {
      await adminApi(`/api/v1/admin/categories/${deleteCategory.dataset.deleteCategory}`, { method: 'DELETE' });
      await loadCategories();
    }
  });

  await Promise.all([loadCategories(), loadStats()]);
  await loadTools();
  setView('dashboard');
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="shell empty"><h1>管理后台加载失败</h1><p>${html(error.message)}</p></main>`;
});

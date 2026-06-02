const CATEGORY_RULES = [
  ['AI工具', ['ai', 'gpt', 'chatgpt', 'deepseek', 'claude', 'kimi', '豆包', '智能', '生成', '写作', '绘画', '抠图']],
  ['图片处理', ['图片', '图像', '照片', '压缩', '放大', '去背景', '背景', 'ocr', 'exif', 'gif']],
  ['文档处理', ['pdf', 'word', 'excel', 'ppt', 'markdown', '文档', '电子书', '书籍', '办公', '打印']],
  ['开发工具', ['json', '代码', '编程', 'api', '接口', '正则', 'regex', 'css', 'html', 'javascript', 'js', 'github', 'linux', '开源']],
  ['数据库', ['数据库', 'database', 'sql', 'sqlite', 'mysql', 'postgres', 'redis', 'mongo']],
  ['设计工具', ['设计', '配色', '颜色', '字体', '图标', 'icon', 'svg', '原型', 'ui']],
  ['站长SEO', ['seo', '站长', '域名', 'whois', '收录', '测速', '网站性能', '关键词']],
  ['效率工具', ['效率', '笔记', '待办', '协作', '白板', '项目管理', '标签页', '书签', '浏览器']],
  ['影音工具', ['音乐', '视频', '影视', '电影', '直播', '字幕', '电视', '音频', '乐谱']],
  ['教育学习', ['学习', '教育', '课程', '学术', '论文', '教材', '字帖', '历史', '医学']],
  ['系统工具', ['windows', 'office', '下载', '软件', '安全', '分区', '卸载', '截图', '输入法']]
];

const CATEGORY_COLORS = {
  AI工具: '#0891b2',
  图片处理: '#2563eb',
  文档处理: '#059669',
  开发工具: '#d97706',
  数据库: '#0d9488',
  设计工具: '#7c3aed',
  站长SEO: '#16a34a',
  效率工具: '#be123c',
  影音工具: '#db2777',
  教育学习: '#0f766e',
  系统工具: '#475569',
  其他: '#4b5563'
};

function inferCategoryName(name = '', description = '', sourceCategory = '') {
  const haystack = `${name} ${description} ${sourceCategory}`.toLowerCase();
  const matched = CATEGORY_RULES.find(([, keywords]) => (
    keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
  ));
  return matched ? matched[0] : (sourceCategory || '其他');
}

function ensureCategory(db, name) {
  const cleanName = String(name || '其他').trim() || '其他';
  const existing = db.prepare('SELECT id FROM category WHERE name = ?').get(cleanName);
  if (existing) return existing.id;

  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM category').get().sort_order;
  return db.prepare(`
    INSERT INTO category (name, sort_order, color, description)
    VALUES (?, ?, ?, ?)
  `).run(
    cleanName,
    Number(maxSort) + 10,
    CATEGORY_COLORS[cleanName] || CATEGORY_COLORS['其他'],
    '系统根据工具名称自动创建的分类'
  ).lastInsertRowid;
}

module.exports = {
  inferCategoryName,
  ensureCategory
};

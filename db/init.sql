PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  color TEXT DEFAULT '#2563eb',
  description TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  status INTEGER DEFAULT 1,
  weight INTEGER DEFAULT 50,
  click_count INTEGER DEFAULT 0,
  icon_url TEXT DEFAULT '',
  seo_keywords TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tool_category ON tool(category_id);
CREATE INDEX IF NOT EXISTS idx_tool_status ON tool(status);
CREATE INDEX IF NOT EXISTS idx_tool_click ON tool(click_count);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_name_unique ON tool(name);

CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_tag (
  tool_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (tool_id, tag_id),
  FOREIGN KEY (tool_id) REFERENCES tool(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS click_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id INTEGER NOT NULL,
  keyword TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tool_id) REFERENCES tool(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS tool_fts USING fts5(
  name,
  description,
  seo_keywords,
  category_name,
  tags,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS tool_after_insert AFTER INSERT ON tool BEGIN
  INSERT INTO tool_fts(rowid, name, description, seo_keywords, category_name, tags)
  VALUES (
    NEW.id,
    NEW.name,
    NEW.description,
    IFNULL(NEW.seo_keywords, ''),
    (SELECT IFNULL(name, '') FROM category WHERE id = NEW.category_id),
    ''
  );
END;

CREATE TRIGGER IF NOT EXISTS tool_after_update AFTER UPDATE ON tool BEGIN
  UPDATE tool_fts
  SET
    name = NEW.name,
    description = NEW.description,
    seo_keywords = IFNULL(NEW.seo_keywords, ''),
    category_name = (SELECT IFNULL(name, '') FROM category WHERE id = NEW.category_id)
  WHERE rowid = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS tool_after_delete AFTER DELETE ON tool BEGIN
  DELETE FROM tool_fts WHERE rowid = OLD.id;
END;

INSERT OR IGNORE INTO category (id, name, sort_order, color, description) VALUES
  (1, '图片处理', 10, '#2563eb', '图片压缩、裁剪、格式转换和视觉工具'),
  (2, '文档处理', 20, '#059669', 'PDF、Office、文本和文档转换工具'),
  (3, '开发工具', 30, '#d97706', '代码格式化、调试、接口和开发辅助工具'),
  (4, '设计工具', 40, '#7c3aed', '颜色、字体、图标和界面设计工具'),
  (5, 'AI工具', 50, '#0891b2', 'AI 写作、生成、总结和效率工具'),
  (6, '其他', 99, '#4b5563', '暂未归类的实用工具'),
  (101, '站长SEO', 70, '#16a34a', 'SEO、性能检测、域名和站点分析工具'),
  (102, '效率工具', 60, '#be123c', '笔记、待办、协作和自动化效率工具');

INSERT OR IGNORE INTO tool (id, name, url, description, category_id, status, weight, icon_url, seo_keywords) VALUES
  (1, 'TinyPNG', 'https://tinypng.com', '在线压缩 PNG、JPEG 和 WebP 图片，在保持画质的同时减少图片体积。', 1, 1, 80, 'https://tinypng.com/images/apple-touch-icon.png', '图片压缩 压缩图片 png jpg webp tinypng'),
  (2, 'Squoosh', 'https://squoosh.app', 'Google 出品的浏览器端图片压缩和格式转换工具，支持多种编码参数。', 1, 1, 75, '', '图片压缩 图片转换 webp avif squoosh'),
  (3, 'PDF24 Tools', 'https://tools.pdf24.org', '免费的在线 PDF 工具集合，支持压缩、合并、拆分、转换和编辑。', 2, 1, 70, '', 'pdf压缩 pdf合并 pdf转换 文档处理'),
  (4, 'JSON Formatter', 'https://jsonformatter.org', '在线格式化、校验、压缩和查看 JSON 数据，适合开发调试。', 3, 1, 72, '', 'json格式化 json校验 json压缩 javascript js'),
  (5, 'Regex101', 'https://regex101.com', '正则表达式测试和解释工具，支持多种语言风格与示例调试。', 3, 1, 68, '', '正则 regex 正则表达式 测试 调试'),
  (6, 'Coolors', 'https://coolors.co', '快速生成、浏览和调整配色方案，适合设计灵感和品牌色管理。', 4, 1, 64, '', '配色 颜色 色板 palette 设计'),
  (7, 'ChatGPT', 'https://chatgpt.com', 'AI 对话助手，可用于写作、总结、代码辅助、翻译和头脑风暴。', 5, 1, 78, '', 'ai 写作 总结 翻译 代码 chatgpt'),
  (8, 'Photopea', 'https://www.photopea.com', '浏览器里的专业图片编辑器，支持 PSD、AI、Sketch、XD 等常见设计文件。', 1, 1, 74, '', '在线ps 图片编辑 psd photopea 抠图 设计'),
  (9, 'Remove.bg', 'https://www.remove.bg', '自动去除图片背景，适合头像、商品图和营销素材快速处理。', 1, 1, 70, '', '抠图 去背景 图片背景 remove bg 人像 商品图'),
  (10, 'iLoveIMG', 'https://www.iloveimg.com', '图片压缩、裁剪、调整尺寸、格式转换和批量处理工具集合。', 1, 1, 66, '', '图片压缩 图片裁剪 图片转换 批量处理'),
  (11, 'iLovePDF', 'https://www.ilovepdf.com', '常用 PDF 在线工具，支持合并、拆分、压缩、转换、解锁和加水印。', 2, 1, 74, '', 'pdf合并 pdf拆分 pdf压缩 pdf转word ilovepdf'),
  (12, 'Smallpdf', 'https://smallpdf.com', '简洁易用的 PDF 处理工具，覆盖转换、压缩、签名和编辑流程。', 2, 1, 68, '', 'pdf转换 pdf压缩 pdf签名 smallpdf 文档'),
  (13, 'CloudConvert', 'https://cloudconvert.com', '在线文件格式转换平台，支持文档、图片、音频、视频等多种格式。', 2, 1, 62, '', '格式转换 文件转换 doc pdf mp4 mp3 cloudconvert'),
  (14, 'Markdown Live Preview', 'https://markdownlivepreview.com', '实时预览 Markdown 文本，适合写 README、文档和博客草稿。', 2, 1, 58, '', 'markdown预览 md 文档 readme 写作'),
  (15, 'Can I use', 'https://caniuse.com', '查询前端特性在各浏览器中的兼容性，是 Web 开发常用参考工具。', 3, 1, 76, '', '浏览器兼容 css html javascript 前端 caniuse'),
  (16, 'CodePen', 'https://codepen.io', '在线编写和分享 HTML、CSS、JavaScript 代码片段，适合原型验证。', 3, 1, 70, '', '在线代码 html css js javascript codepen 前端'),
  (17, 'StackBlitz', 'https://stackblitz.com', '浏览器中的在线开发环境，适合快速创建前端和全栈项目。', 3, 1, 66, '', '在线ide 前端开发 node vue react stackblitz'),
  (18, 'Hoppscotch', 'https://hoppscotch.io', '轻量级在线 API 调试工具，支持 REST、GraphQL、WebSocket 等请求。', 3, 1, 72, '', 'api调试 http接口 postman rest graphql websocket'),
  (19, 'JWT.io', 'https://jwt.io', '查看、解码和调试 JWT Token，适合接口鉴权和登录问题排查。', 3, 1, 67, '', 'jwt token 解码 鉴权 登录 开发'),
  (20, 'Crontab Guru', 'https://crontab.guru', '解释和验证 crontab 表达式，帮助确认定时任务执行时间。', 3, 1, 61, '', 'cron crontab 定时任务 表达式 linux'),
  (21, 'Figma', 'https://www.figma.com', '在线协作设计工具，适合界面设计、原型制作和设计系统管理。', 4, 1, 74, '', 'figma ui设计 原型 协作 设计工具'),
  (22, 'Iconify', 'https://icon-sets.iconify.design', '聚合多套开源图标库，支持快速搜索、复制和集成图标。', 4, 1, 64, '', '图标 icon svg iconify lucide heroicons'),
  (23, 'Google Fonts', 'https://fonts.google.com', '浏览和使用开源字体，适合网页排版和品牌视觉设计。', 4, 1, 60, '', '字体 fonts typography google fonts 设计'),
  (24, 'Realtime Colors', 'https://www.realtimecolors.com', '实时预览网站配色组合，快速评估文字、背景和按钮颜色效果。', 4, 1, 62, '', '配色 颜色 网站颜色 可访问性 contrast'),
  (25, 'Claude', 'https://claude.ai', 'AI 对话和文档处理助手，适合长文本分析、写作和代码辅助。', 5, 1, 70, '', 'ai claude 文档分析 写作 总结 代码'),
  (26, 'Perplexity', 'https://www.perplexity.ai', '带来源引用的 AI 搜索工具，适合资料检索、调研和问题探索。', 5, 1, 68, '', 'ai搜索 perplexity 资料检索 调研 问答'),
  (27, 'DeepL', 'https://www.deepl.com/translator', '高质量在线翻译工具，适合多语言文本翻译和润色。', 5, 1, 66, '', '翻译 deepl 英文 中文 多语言 ai'),
  (28, 'Notion', 'https://www.notion.so', '集笔记、知识库、项目管理和数据库于一体的在线协作工具。', 102, 1, 66, '', '笔记 知识库 项目管理 协作 notion'),
  (29, 'Trello', 'https://trello.com', '看板式任务管理工具，适合个人待办、团队协作和项目流程跟踪。', 102, 1, 57, '', '看板 任务管理 todo 项目管理 trello'),
  (30, 'Excalidraw', 'https://excalidraw.com', '手绘风格白板工具，适合画流程图、架构图、草图和头脑风暴。', 102, 1, 63, '', '白板 画图 流程图 架构图 草图 excalidraw'),
  (31, 'PageSpeed Insights', 'https://pagespeed.web.dev', 'Google 网站性能检测工具，提供性能、可访问性和 SEO 优化建议。', 101, 1, 72, '', '网站性能 pagespeed seo lighthouse 速度检测'),
  (32, 'Google Search Console', 'https://search.google.com/search-console', 'Google 官方站长平台，用于查看收录、搜索表现和站点问题。', 101, 1, 68, '', 'seo 收录 站长 google search console'),
  (33, 'Ahrefs Webmaster Tools', 'https://ahrefs.com/webmaster-tools', '站点 SEO 健康检查和外链分析工具，适合监控网站可见性。', 101, 1, 61, '', 'seo 外链 站点分析 ahrefs 关键词'),
  (34, 'WHOIS Lookup', 'https://who.is', '查询域名注册信息、DNS、到期时间和基础网络信息。', 101, 1, 56, '', 'whois 域名查询 dns 域名到期 站长'),
  (35, 'VirusTotal', 'https://www.virustotal.com', '检测 URL、文件和域名安全风险，适合排查可疑链接。', 6, 1, 62, '', '安全检测 url 文件 病毒 virustotal');

INSERT OR IGNORE INTO tag (id, name) VALUES
  (1, '免费'),
  (2, '无需注册'),
  (3, '开发'),
  (4, '设计'),
  (5, 'AI'),
  (6, '文档'),
  (7, '协作'),
  (8, 'SEO'),
  (9, '图片'),
  (10, '效率');

INSERT OR IGNORE INTO tool_tag (tool_id, tag_id) VALUES
  (1, 1), (1, 2),
  (2, 1), (2, 2),
  (3, 1),
  (4, 1), (4, 2), (4, 3),
  (5, 1), (5, 3),
  (6, 1), (6, 4),
  (7, 5),
  (8, 1), (8, 2), (8, 4), (8, 9),
  (9, 9),
  (10, 1), (10, 9),
  (11, 1), (11, 6),
  (12, 6),
  (13, 6),
  (14, 1), (14, 2), (14, 6),
  (15, 1), (15, 2), (15, 3),
  (16, 1), (16, 3),
  (17, 1), (17, 3),
  (18, 1), (18, 2), (18, 3),
  (19, 1), (19, 2), (19, 3),
  (20, 1), (20, 2), (20, 3),
  (21, 4), (21, 7),
  (22, 1), (22, 2), (22, 4),
  (23, 1), (23, 2), (23, 4),
  (24, 1), (24, 2), (24, 4),
  (25, 5),
  (26, 5),
  (27, 1), (27, 5),
  (28, 7), (28, 10),
  (29, 1), (29, 7), (29, 10),
  (30, 1), (30, 2), (30, 10),
  (31, 1), (31, 2), (31, 8),
  (32, 1), (32, 8),
  (33, 8),
  (34, 1), (34, 2), (34, 8),
  (35, 1), (35, 2);

UPDATE tool
SET category_id = (SELECT id FROM category WHERE name = '效率工具' LIMIT 1)
WHERE name IN ('Notion', 'Trello', 'Excalidraw')
  AND EXISTS (SELECT 1 FROM category WHERE name = '效率工具');

UPDATE tool
SET category_id = (SELECT id FROM category WHERE name = '站长SEO' LIMIT 1)
WHERE name IN ('PageSpeed Insights', 'Google Search Console', 'Ahrefs Webmaster Tools', 'WHOIS Lookup')
  AND EXISTS (SELECT 1 FROM category WHERE name = '站长SEO');

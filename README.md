# ToolFind

轻量级智能工具搜索引擎，基于 Express + SQLite FTS5。

示例站点： https://toolfind.opxk.space

## 本地运行

```bash
npm install
cp .env.example .env
npm start
```

访问：

- 用户端：http://localhost:3000
- 管理后台：http://localhost:3000/admin.html

如果 Windows 拒绝监听 `3000` 端口，程序会自动尝试 `5173`、`8080`、`8787`、`9000`，以终端输出的地址为准。也可以手动指定端口：

```powershell
$env:PORT=8080
npm start
```

默认后台账号见 `.env.example`，生产环境请修改 `ADMIN_PASSWORD`。

## 后台增强功能

- 自动获取图标：在工具表单填写 URL 后点击“自动获取图标”，系统会优先读取目标站点页面中的 favicon / apple-touch-icon，找不到时尝试 `/favicon.ico`。
- 默认图标策略：新增/编辑工具时如果未填写图标 URL，系统会自动获取目标站 favicon；前台仍会在获取失败时显示首字母占位。
- 链接健康检测：后台“工具管理”可手动点击“检测链接”；服务端也会按 `HEALTH_CHECK_INTERVAL_HOURS` 定时检测上架工具，不可访问的工具会自动下架。
- 健康检测配置：`HEALTH_CHECK_ENABLED=true`、`HEALTH_CHECK_INTERVAL_HOURS=24`、`HEALTH_CHECK_ON_START=false`。

批量补齐或重抓全部图标：

```bash
npm run icons:fetch
npm run icons:fetch:force
```

## 数据维护

工具去重和分类维护规则：

- 工具唯一性优先使用 `normalized_url`，会去掉 `utm_*`、`ref`、`source` 等常见推广参数，并忽略域名开头的 `www.`。
- 工具名称也做唯一检测，后台新增/编辑会按大小写不敏感方式检测同名工具。
- 工具分类可手动选择，也可以留空走“自动分类”；系统会根据工具名称和描述推断分类，没有对应分类时自动创建。
- 分类 ID 可通过维护脚本压实为连续自增，当前分类自增序列会从最大 ID 之后继续。

执行维护：

```bash
npm run data:maintain
```

## Docker 部署

```bash
docker compose up -d --build
```

SQLite 数据库保存在 Docker volume `toolfind_data` 中。

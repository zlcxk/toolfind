# ToolFind

轻量级智能工具搜索引擎，基于 Express + SQLite FTS5。

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

## Docker 部署

```bash
docker compose up -d --build
```

SQLite 数据库保存在 Docker volume `toolfind_data` 中。

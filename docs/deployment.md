# 线上部署方案

## 目标

本项目当前默认以本地 Demo 交付，依赖 Next.js、PostgreSQL、MinIO、Worker 和 GPT 5.5 API。线上部署时需要把这些本地依赖替换成托管服务或长期运行的云服务，并保证 Create 任务、对象存储、Play 远端加载和 OAuth 回调都能在公网环境下工作。

## 推荐架构

推荐使用拆分式部署：

```text
Browser
  -> Vercel / Railway Web: Next.js 页面和 API
  -> Railway Worker: npm run worker
  -> Supabase / Neon: PostgreSQL
  -> Railway Redis / Upstash Redis: BullMQ queue
  -> Cloudflare R2 / AWS S3 / 阿里云 OSS: 对象存储
  -> GPT 5.5 / OpenAI-compatible API: Planner/Coder/Vision
```

推荐组合：

- Web/API：Vercel 或 Railway
- Worker：Railway / Render / Fly.io
- Database：Supabase / Neon / Railway PostgreSQL
- Queue：Railway Redis / Upstash Redis
- Object Storage：Cloudflare R2 / AWS S3 / 阿里云 OSS / 腾讯云 COS
- OAuth：GitHub / Google OAuth App，回调地址改为线上域名
- Model：飞书 GPT 5.5 API 或其他 OpenAI-compatible provider

## 为什么 Worker 要单独部署

Next.js Web 服务负责页面和 API，但生成游戏是长任务：

- 调模型可能需要几十秒。
- 上传 HTML、Manifest、封面和素材需要访问对象存储。
- 任务需要一个长期运行的 BullMQ consumer 来处理 Redis 队列。

因此线上需要一个长期运行的 Worker 进程：

```bash
npm run worker
```

如果只部署 Web，不部署 Worker，Create 任务会入队但不会被消费，页面会一直停在 `PENDING / 0%`。

## 环境变量

线上环境变量应基于 `.env.example` 配置，不要提交真实密钥。

### App

```env
APP_URL="https://your-demo-domain.com"
AUTH_COOKIE_NAME="ai_arcade_session"
AUTH_SECRET="replace-with-production-random-secret"
ADMIN_EMAILS="admin@example.com,creator@example.com"
```

`AUTH_SECRET` 应使用生产随机值，长度至少 16 位，建议使用 32 位以上随机字符串。

### Database

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public"
```

推荐使用 Supabase、Neon 或 Railway PostgreSQL。

部署后需要执行：

```bash
npx prisma migrate deploy
npm run db:seed
```

生产环境应使用 `prisma migrate deploy`，不要使用交互式的 `prisma migrate dev`。

### Redis / BullMQ

```env
REDIS_URL="redis://USER:PASSWORD@HOST:PORT"
```

本地 `docker-compose.yml` 已包含 Redis。线上推荐 Railway Redis 或 Upstash Redis。队列 payload 只包含 `jobId`，数据库仍然是任务状态和结果的权威来源。

### Object Storage

如果使用 S3/R2/OSS/COS：

```env
S3_ENDPOINT="https://<account-or-region-endpoint>"
S3_INTERNAL_ENDPOINT="https://<account-or-region-endpoint>"
S3_REGION="auto"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_BUCKET="ai-arcade"
S3_FORCE_PATH_STYLE="true"
S3_PUBLIC_BASE_URL="https://<public-bucket-domain>/ai-arcade"
```

要求：

- bucket 需要允许公开读取生成产物。
- `S3_PUBLIC_BASE_URL` 必须是浏览器可访问的公网地址。
- Play 页会通过 `manifestUrl` 和 `entryUrl` 加载远端文件。

### Model API

飞书 GPT 5.5 示例：

```env
OPENAI_API_KEY="..."
OPENAI_BASE_URL="http://43.106.115.130:8080/v1"
MODEL_NAME="gpt-5.5"
MODEL_WIRE_API="responses"
```

如果线上环境访问模型 API 不需要代理，可以不配置：

```env
OUTBOUND_PROXY_URL=""
```

如果需要代理：

```env
OUTBOUND_PROXY_URL="http://proxy-host:port"
```

### OAuth

线上 GitHub OAuth App：

```env
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GITHUB_REDIRECT_URI="https://your-demo-domain.com/api/auth/github/callback"
```

线上 Google OAuth：

```env
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="https://your-demo-domain.com/api/auth/google/callback"
```

GitHub / Google 控制台中的 callback URL 必须与环境变量完全一致。

## 部署步骤：Vercel + Railway + Supabase + R2

### 1. 准备数据库

1. 在 Supabase / Neon 创建 PostgreSQL。
2. 复制连接字符串到 `DATABASE_URL`。
3. 在部署环境执行：

```bash
npx prisma migrate deploy
npm run db:seed
```

### 2. 准备对象存储

1. 创建 R2 / S3 bucket，例如 `ai-arcade`。
2. 创建访问密钥。
3. 配置 bucket 公开读或绑定公开域名。
4. 填写 `S3_*` 环境变量。
5. 确保浏览器能打开类似地址：

```text
https://your-bucket-domain/ai-arcade/games/.../manifest.json
```

### 3. 部署 Next.js Web

在 Vercel 或 Railway 部署项目根目录。

构建命令：

```bash
npm run build
```

启动命令：

```bash
npm run start
```

Web 服务负责：

- 页面渲染
- Auth API
- Create API
- Game API
- Admin API
- Play manifest 加载

### 4. 部署 Worker

在 Railway / Render / Fly.io 新建一个 Worker 服务，使用同一个 GitHub 仓库。

启动命令：

```bash
npm run worker
```

Worker 需要和 Web 使用同一组环境变量，尤其是：

- `DATABASE_URL`
- `REDIS_URL`
- `S3_*`
- `OPENAI_*`
- `MODEL_WIRE_API`
- `OUTBOUND_PROXY_URL`

### 5. 配置 OAuth

把线上域名填入 OAuth 平台：

GitHub：

```text
Homepage URL:
https://your-demo-domain.com

Authorization callback URL:
https://your-demo-domain.com/api/auth/github/callback
```

Google：

```text
Authorized JavaScript origins:
https://your-demo-domain.com

Authorized redirect URIs:
https://your-demo-domain.com/api/auth/google/callback
```

### 6. 验证线上链路

按顺序验证：

1. 访问 `/api/health`，确认 database 和 redis 都是 `ok`。
2. 打开首页，能看到 seed 游戏。
3. 邮箱注册 / 登录。
4. GitHub OAuth 或 Google OAuth。
5. 进入 Create，提交 prompt 和图片。
6. Worker 处理任务，任务从 `PENDING` 到 `SUCCEEDED`。
7. MinIO/R2/S3 中出现：

```text
uploads/{userId}/{jobId}/...
games/{jobId}/v1/index.html
games/{jobId}/v1/manifest.json
games/{jobId}/v1/cover.svg
```

8. 首页出现新游戏。
9. Play 页面动态加载远端 manifest 和 HTML。
10. 管理后台可查看游戏、举报、任务和审计日志。

## 备选方案：单台云服务器 + Docker Compose

如果想最接近本地环境，可以使用一台云服务器。

部署内容：

- Node.js
- Docker / Docker Compose
- PostgreSQL 容器
- Redis 容器
- MinIO 容器
- Next.js Web
- Worker
- Nginx
- HTTPS 证书

步骤：

```bash
git clone <repo>
cd <repo>
cp .env.example .env
npm install
docker compose up -d
npx prisma migrate deploy
npm run db:seed
npm run build
npm run start
npm run worker
```

生产建议使用进程管理器：

```bash
pm2 start "npm run start" --name ai-arcade-web
pm2 start "npm run worker" --name ai-arcade-worker
```

再用 Nginx 将公网 HTTPS 转发到：

```text
localhost:3000
```

如果继续使用 MinIO，需要给 MinIO 配置公网域名，并确保 `S3_PUBLIC_BASE_URL` 是 HTTPS 可访问地址。

## 生产注意事项

### 安全

- 不提交 `.env`。
- `AUTH_SECRET` 必须换成生产随机值。
- OAuth callback 必须是 HTTPS。
- bucket 只公开生成产物读取，不开放写权限。
- Admin 通过 `ADMIN_EMAILS` 控制。
- 生成 HTML 只允许通过 iframe sandbox 运行。

### 可观测性

线上建议额外接入：

- Web 日志
- Worker 日志
- 错误告警
- 生成任务失败率
- 模型调用耗时
- 对象存储上传失败率

当前项目已内置：

- `AgentLog`
- `GameEvent`
- `AdminAuditLog`
- `GenerationJob.status`

### 扩展

如果流量增加，可演进为：

- Redis + BullMQ 替代数据库轮询
- Worker 横向扩容
- 对象存储 CDN
- 更严格的 HTML 静态扫描
- 更完整的模型 usage 成本统计

## 当前交付建议

本笔试项目可以先以本地 Demo 交付，因为本地链路完整、稳定、可复现。

如果提交材料要求填写 Demo 地址，可写：

```text
当前 Demo 为本地运行版本。完整启动方式见 README 和 docs/deployment.md。
```

如果需要线上化，推荐使用：

```text
Vercel/Railway Web + Railway Worker + Supabase PostgreSQL + Cloudflare R2
```

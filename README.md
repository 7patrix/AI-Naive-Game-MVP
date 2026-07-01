# AI 游戏工坊

AI 游戏工坊是一个面向创作者的 AI Native 互动小游戏平台。用户可以用自然语言描述玩法，上传图片、文本设定或其他素材，系统会异步生成可在线游玩的 HTML 小游戏，并支持发布、浏览、Remix、点赞收藏、举报和个人主页展示。

线上域名：

```text
https://duckmole.site
```

> 当前域名处于 ICP 备案流程时可能会临时暂停 DNS 解析；代码与部署仍然通过 GitHub + Railway 持续更新。

## 产品能力

- **AI 生成小游戏**：输入创意和素材，生成可直接游玩的 Web Canvas/HTML 游戏。
- **多模态素材输入**：支持图片、文本、视频、音频、文档等上传；文本素材会被分析为角色、规则、场景、台词、分支等结构。
- **长文本创作支持**：长篇 txt 会抽取开头、中段和结尾，保留设定、剧情推进和结局信息，适合 galgame、视觉小说、规则文档和剧情脚本。
- **跨设备游玩**：新生成游戏支持桌面键盘/鼠标与手机触控；播放器提供统一 `AI_ARCADE_INPUT` 输入协议、虚拟摇杆和动作按钮。
- **作品发布与游玩**：生成后的游戏会上传到对象存储，进入首页、详情页和 Play 页，使用 iframe sandbox 隔离运行。
- **账号与安全**：邮箱注册、邮箱验证、登录/退出、忘记密码、重置密码、GitHub/Google OAuth。
- **创作者社区**：用户资料页、头像上传、公开主页、创作者榜、作者主页跳转。
- **互动与治理**：点赞、收藏、举报、管理后台、内容下架/恢复、任务删除、审计日志。
- **API 管理与额度**：用户可以配置自己的 OpenAI-compatible API Key；生成任务可选择平台额度或自带 API，并记录成本来源。
- **后台运维**：管理后台展示游戏、举报、生成任务、用户用量、任务来源和失败原因。

## 核心流程

```text
登录/注册
-> Create 输入创意和上传素材
-> GenerationJob 入库
-> BullMQ 入队
-> Worker 执行 LangGraph 生成流水线
-> 生成 HTML / manifest / cover
-> 上传 S3-compatible 对象存储
-> Game 入库并发布
-> Home / Detail / Play 在线游玩
```

## 技术架构

- **前端/后端**：Next.js App Router + React + TypeScript
- **样式**：Tailwind CSS
- **数据库**：PostgreSQL + Prisma
- **队列**：Redis + BullMQ
- **Worker**：Node.js + `tsx`
- **Agent 编排**：LangGraph `StateGraph`
- **模型接口**：OpenAI-compatible API，支持 `chat` / `responses` / vision
- **对象存储**：MinIO（本地）/ Supabase Storage S3-compatible（线上）/ 其他 S3-compatible provider
- **邮件服务**：Resend
- **运行隔离**：iframe sandbox
- **部署**：Railway Web + Railway Worker + Railway Postgres/Redis + Supabase Storage

## Agent 流水线

生成任务由 Worker 异步处理，主要阶段包括：

- `AssetAnalyzerAgent`：解析上传素材，读取图片尺寸、文本内容和视觉摘要。
- `PlannerAgent`：将创意和素材整理成游戏规格。
- `CoderAgent`：生成单文件 HTML 游戏。
- `ReviewerAgent`：检查基础安全规则，阻止外链脚本和游戏内文件上传。
- `PublisherAgent`：上传 HTML、manifest、封面并创建游戏记录。
- `CostAgent`：记录 token 和估算成本。

每个阶段会写入 `AgentLog` 和 `JobArtifact`，方便后台排查和回放。

## 线上部署说明

线上使用 Railway 拆分为两个服务：

```text
Web    -> npm run start
Worker -> npm run worker
```

Web 负责页面和 API，Worker 负责消费生成队列。只部署 Web 不部署 Worker 时，Create 任务会停在 `PENDING / 0%`。

线上关键环境变量：

```env
APP_URL="https://duckmole.site"
AUTH_COOKIE_NAME="ai_arcade_session"
AUTH_SECRET="replace-with-production-random-secret"
ADMIN_EMAILS="admin@example.com"

DATABASE_URL="..."
REDIS_URL="..."

OPENAI_API_KEY="..."
OPENAI_BASE_URL="https://api.openai.com/v1"
MODEL_NAME="gpt-5.5"
MODEL_WIRE_API="chat"

S3_ENDPOINT="..."
S3_INTERNAL_ENDPOINT="..."
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_BUCKET="Game"
S3_FORCE_PATH_STYLE="true"
S3_PUBLIC_BASE_URL="..."

RESEND_API_KEY="re_..."
EMAIL_FROM="AI 游戏工坊 <noreply@your-domain.com>"
EMAIL_VERIFICATION_TOKEN_TTL_MINUTES="60"

API_KEY_ENCRYPTION_SECRET="replace-with-stable-random-secret"
```

`API_KEY_ENCRYPTION_SECRET` 用于加密用户自带 API Key。生产环境一旦保存过用户 API Key，就不要随意更换这个值，否则旧 key 将无法解密。

数据库变更上线后执行：

```bash
npm run db:deploy
```

## 本地开发

前置依赖：

- Node.js + npm
- Docker Desktop + Docker Compose

启动本地依赖：

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
```

启动 Web：

```bash
npm run dev
```

另开终端启动 Worker：

```bash
npm run worker
```

访问地址：

- Web：http://localhost:3000
- MinIO Console：http://localhost:9001

本地测试账号：

```text
邮箱：creator@example.com
密码：Password123!
```

## 常用命令

```bash
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:seed
npm run dev
npm run worker
```

## 目录结构

```text
src/app/                  Next.js App Router 页面和 API
src/components/           播放器等通用组件
src/lib/                  auth、db、storage、queue、model client 等基础设施
workers/generator/        BullMQ Worker + LangGraph 生成流水线
prisma/                   Prisma schema、migration、seed
docs/                     架构、接口、部署和验证文档
public/                   静态文件和站点验证文件
```

## 当前状态

项目已经进入线上产品化阶段，支持真实域名、邮箱验证、OAuth、对象存储、异步生成、用户资料、API 管理、管理后台和跨设备游玩。后续可继续扩展订阅计费、套餐额度、用户关系、内容审核队列和更完整的数据看板。

# AI 游戏工坊 MVP

AI 游戏工坊是一个 AI Native 互动游戏 Web 平台 MVP，用于演示从登录注册、创意输入、异步 Agent 生成、对象存储发布，到首页浏览和远端游玩的完整业务闭环。

核心链路：

```text
注册/登录 -> Create 输入创意 -> Worker 执行 Agent 流水线
-> 生成 HTML/Manifest/封面 -> 上传 MinIO -> Game meta 入库
-> Home 展示 -> Detail 查看 -> Play 动态加载远端游戏
```

## 技术栈

- 前端/后端：Next.js App Router、React、TypeScript
- 样式：Tailwind CSS
- 数据库：PostgreSQL + Prisma
- 对象存储：MinIO，S3 兼容协议
- 异步任务：Node.js Worker
- 游戏运行隔离：iframe sandbox

## 本地启动

前置依赖：

- Node.js + npm
- Docker Desktop + Docker Compose

启动数据库和对象存储：

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

另开一个终端启动 Worker：

```bash
npm run worker
```

访问地址：

- Web 应用：http://localhost:3000
- MinIO 控制台：http://localhost:9001

MinIO 默认账号：

```text
用户名：minioadmin
密码：minioadmin
```

测试账号：

```text
邮箱：creator@example.com
密码：Password123!
```

## 演示步骤

1. 打开 `http://localhost:3000`，查看首页已发布游戏。
2. 使用测试账号登录。
3. 进入 `/create`，输入一个小游戏创意。
4. 提交后查看 `GenerationJob` 状态、进度和 Agent 日志。
5. 等 Worker 处理完成后，回到首页查看新生成游戏。
6. 进入游戏详情页，确认 Manifest 地址和游戏 meta。
7. 点击“开始游玩”，Play 页会读取远端 Manifest，并用 iframe sandbox 加载 MinIO 中的远端 HTML 游戏。

示例 prompt：

```text
做一个霓虹太空飞船躲避陨石的小游戏，玩家用方向键移动飞船，碰到陨石就失败，分数随着存活时间增长。
```

## 已实现功能

- 邮箱注册、邮箱登录、退出登录
- 密码 hash 存储和 session cookie
- 受保护 Create 页面
- Home 展示已发布游戏
- Game Detail 页面
- Create 生成任务
- 多文件上传到 MinIO
- Worker 异步处理任务
- Planner/Coder/Reviewer/Publisher Agent 日志
- 生成 HTML Canvas 小游戏
- 生成并上传 `manifest.json`
- 创建 `PUBLISHED` Game 记录
- Play 页远端 Manifest 加载
- iframe sandbox 动态运行远端游戏
- `GameEvent` 埋点和 `playCount`
- Home 搜索、标签筛选、排序
- 游戏点赞和收藏
- 生成任务自动刷新和失败重试
- 详情页展示游玩埋点统计
- 可配置 Google / GitHub OAuth 登录
- OpenAI-compatible LLM 可选接入，失败自动 fallback

## 当前取舍

当前 MVP 默认使用本地 fallback generator 生成 Canvas HTML 小游戏。fallback 会根据 prompt 关键词选择躲避、收集、点击反应、追逐等不同玩法模板，避免所有生成结果都是固定假数据。配置 `OPENAI_API_KEY` 后，`PlannerAgent` 和 `CoderAgent` 会优先调用 OpenAI-compatible Chat Completions API；如果没有 Key 或调用失败，会自动回退到本地生成器。

系统已经预留真实模型接入点：

```text
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
MODEL_NAME="gpt-5.5"
MODEL_WIRE_API="chat"
OUTBOUND_PROXY_URL="http://127.0.0.1:7897"
```

`OPENAI_BASE_URL` 可替换为任意 OpenAI-compatible 服务地址。飞书提供的 GPT 5.5 接入文档使用 `OPENAI_BASE_URL="http://43.106.115.130:8080/v1"` 和 `MODEL_WIRE_API="responses"`。`OUTBOUND_PROXY_URL` 可选，本地网络需要代理访问模型服务或 GitHub OAuth 时再配置。模型调用成功时 AgentLog 会标记 `source: llm`；失败时会写入 `llm_fallback` 并继续使用本地 generator，保留任务、日志、对象存储、Manifest 和 Play 运行协议。

Google / GitHub OAuth 是可选能力。两者共用 `OAuthAccount(provider, providerAccountId)` 数据模型；配置对应变量后，登录页的第三方登录可以真实跑通：

```text
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GITHUB_REDIRECT_URI="http://localhost:3000/api/auth/github/callback"
```

## 文档

- [系统设计](docs/system-design.md)
- [核心接口](docs/api.md)
- [Agent 工作流](docs/agent-workflow.md)
- [安全方案](docs/security.md)
- [完成度说明](docs/completion-report.md)
- [测试与验证](docs/verification.md)

## 常用命令

```bash
npm run typecheck
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
npm run worker
```

# 文档总览与交付索引

## 目的

这个目录用于支撑笔试项目交付，覆盖系统设计、接口、数据模型、Agent 工作流、远端产物协议、安全方案、完成度说明、验证证据、线上部署方案和 AI 协作记录。

如果评审只想快速了解项目，建议阅读顺序：

1. `README.md`
2. `docs/system-design.md`
3. `docs/agent-workflow.md`
4. `docs/verification.md`
5. `docs/completion-report.md`

## 文档对应关系

| 文件 | 对应交付项 | 内容说明 |
| --- | --- | --- |
| `README.md` | Demo 启动方式、技术栈、测试账号、功能概览 | 面向评审的第一入口，说明如何启动和体验核心链路。 |
| `docs/system-design.md` | 系统设计文档 | 架构图、技术栈、模块划分、数据模型、远端产物协议、加分项说明。 |
| `docs/api.md` | 核心接口 | Auth、Create、Game、Admin 等 API 的路径、用途和行为。 |
| `docs/agent-workflow.md` | Agent 工作流 | LangGraph 编排、各 Agent 职责、模型接入、日志标记。 |
| `docs/security.md` | 安全方案 | session、OAuth、对象存储、iframe sandbox、审核、管理员治理和已知限制。 |
| `docs/completion-report.md` | 完成度说明 | 已完成、fallback/Mock、未完成和一周后迭代计划。 |
| `docs/verification.md` | 测试与验证证据 | 本地启动、手工验收步骤、OAuth、LLM、Admin 和 Play 验证方式。 |
| `docs/deployment.md` | 线上部署方案 | Vercel/Railway/Supabase/R2 推荐方案，以及单机 Docker Compose 备选方案。 |
| `docs/ai-collaboration.md` | AI 协作记录 | 使用 Cursor/GPT-5.5 的方式、AI 贡献、人工修复和测试方法。 |

## 代码目录对应关系

| 路径 | 所属模块 | 说明 |
| --- | --- | --- |
| `src/app/page.tsx` | Home | 首页，展示已发布游戏、搜索、筛选、排序、直接 Play。 |
| `src/app/create/page.tsx` | Create | 创意输入、多文件上传、任务历史、Agent 日志、产物地址。 |
| `src/app/play/[id]/page.tsx` | Play | 服务端读取游戏 meta、拉取 Manifest、记录 `PLAY_START`。 |
| `src/app/play/[id]/PlayFrame.tsx` | Play | 客户端 iframe 加载、重新开始、键盘转发、加载埋点。 |
| `src/app/games/[slug]/page.tsx` | Game Detail | 详情、版本、Remix、点赞收藏、举报、埋点统计。 |
| `src/app/admin/page.tsx` | Admin | 管理后台，支持内容治理、举报处理、任务观察和审计日志。 |
| `src/app/api/**/route.ts` | Backend API | Next.js Route Handlers，处理登录、任务、游戏互动、管理操作。 |
| `src/lib/auth.ts` | Auth | session、密码 hash、当前用户、管理员权限判断。 |
| `src/lib/db.ts` | Database | Prisma Client 单例。 |
| `src/lib/storage.ts` | Object Storage | MinIO/S3 上传与公开 URL 生成。 |
| `src/lib/model-client.ts` | Model API | GPT-5.5 / OpenAI-compatible 文本、JSON、vision 调用。 |
| `src/lib/outbound-fetch.ts` | Network | 服务端出站代理，支持 OAuth 和模型 API 走代理。 |
| `workers/generator/index.ts` | Worker / Agent | LangGraph 编排的生成任务 Worker，执行 AssetAnalyzer/Planner/Coder/Reviewer/Publisher/Cost。 |
| `prisma/schema.prisma` | Data Model | 用户、游戏、版本、素材、任务、日志、举报、审计等数据模型。 |
| `prisma/migrations/` | Database Migration | 数据库结构迁移 SQL。 |
| `prisma/seed.ts` | Test Data | 测试账号和 3 个示例游戏。 |
| `docker-compose.yml` | Local Infra | 本地 PostgreSQL、MinIO 和初始化服务。 |

## 验收要求覆盖情况

| 要求 | 项目覆盖 |
| --- | --- |
| 登录注册 | 邮箱注册/登录/退出，session，受保护 Create，GitHub OAuth 已跑通，Google OAuth 已实现。 |
| Home | 数据库 published 游戏、封面/标题/作者/简介/标签/发布时间、搜索/筛选/排序、详情和直接 Play。 |
| Play | 数据库 meta -> 远端 manifest -> MinIO HTML -> iframe sandbox，加载态、失败态、重开、埋点。 |
| Create | prompt、多文件上传、MinIO、GenerationJob、LangGraph Agent、进度、日志、产物 URL、可游玩结果。 |
| 加分项 | Remix、版本管理、任务历史、Agent 日志、失败重试、内容审核、资源限额、成本估算、管理后台、举报、OAuth、vision。 |
| 交付材料 | README、`.env.example`、Docker Compose、系统设计、API、Agent、安全、完成度、验证、部署、AI 协作记录。 |


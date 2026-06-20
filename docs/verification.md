# 测试与验证

## 本地环境

已验证的本地依赖：

- Node.js / npm
- Docker Desktop
- PostgreSQL 容器
- MinIO 容器

## 启动命令

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

另开终端启动 Worker：

```bash
npm run worker
```

## 验证过的命令

```bash
npm run typecheck
npm run build
```

结果：通过。

本轮数据库迁移：

```bash
npx prisma validate
npx prisma migrate dev --skip-generate
```

结果：通过。`npx prisma generate` 在 Windows 环境下遇到 Prisma query engine DLL 文件锁，需要释放占用后重跑。

## 手工验收步骤

### 1. 首页

打开：

```text
http://localhost:3000
```

预期：

- 能看到 3 个 seed 游戏。
- 能看到通过 Create 生成的新游戏。
- 游戏卡片包含封面、标题、作者、简介、标签、发布时间、游玩次数。
- 可以使用搜索框、标签筛选和排序。

### 2. 注册/登录

打开：

```text
http://localhost:3000/register
http://localhost:3000/login
```

测试账号：

```text
creator@example.com
Password123!
```

预期：

- 登录成功后导航栏显示当前邮箱。
- 点击退出登录后 session 清除。
- 未登录访问 `/create` 会跳转到登录页。

### 3. Create

打开：

```text
http://localhost:3000/create
```

输入示例：

```text
做一个霓虹太空飞船躲避陨石的小游戏，玩家用方向键移动飞船，碰到陨石就失败，分数随着存活时间增长。
```

预期：

- 创建 `GenerationJob`。
- 页面显示任务状态、进度和 Agent 日志。
- 页面显示审核状态和生成成本估算。
- Worker 处理后状态变为 `SUCCEEDED`。
- 失败任务会显示重试按钮。
- 任务完成后能看到 Manifest 和 Bundle 地址。

### 4. 对象存储

MinIO 控制台：

```text
http://localhost:9001
```

账号：

```text
minioadmin
minioadmin
```

预期：

- bucket `ai-arcade` 存在。
- 能看到 `games/{jobId}/v1/index.html`、`manifest.json` 和 `cover.svg`。
- 如果 Create 上传了图片素材，Manifest `assets` 中应同时包含 `uploads/{userId}/{jobId}/...` 的素材 URL。

### 5. Play

从首页进入生成游戏详情页，点击“开始游玩”。

预期：

- Play 页展示 Manifest 地址和 iframe 入口。
- iframe 区域先展示准备开始 overlay，需要点击“开始游戏”后才挂载远端 iframe。
- iframe 加载 MinIO 中的远端 HTML 游戏。
- iframe 加载成功后 overlay 消失。
- 可以用方向键或 WASD 控制飞船。
- 数据库中 `playCount` 自增，并写入 `PLAY_START`。
- iframe 实际加载成功后通过客户端 API 写入 `PLAY_LOADED`；加载超时或错误会写入 `PLAY_ERROR`。
- 详情页能看到 `PLAY_START`、`PLAY_LOADED`、`PLAY_ERROR` 统计。

### 6. Remix 与版本

登录后进入任意游戏详情页，点击“Remix 派生这个游戏”。

预期：

- Create 页面显示源游戏和源版本。
- 提交后生成任务记录 `parentGameId` 和 `remixSourceVersionId`。
- Worker 发布新游戏后，详情页显示 Remix 来源。
- 新游戏详情页有 v1 版本历史。
- 源游戏详情页能看到派生作品列表。

### 7. 内容审核与资源限额

预期：

- prompt 命中轻量敏感词时任务直接失败，不进入 Worker。
- 超过并发任务数、24 小时任务数、文件数量或上传大小时 Create API 返回错误提示。

### 8. 点赞和收藏

登录后进入任意游戏详情页。

预期：

- 点击“点赞”会增加点赞数。
- 再次点击会取消点赞。
- 点击“收藏”会增加收藏数。
- 再次点击会取消收藏。

### 9. Google / GitHub OAuth

配置：

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/github/callback
```

预期：

- 登录页点击“使用 Google 登录”后进入 Google 授权页。
- 登录页点击“使用 GitHub 登录”后进入 GitHub 授权页。
- 回调后创建或绑定本地账号，并进入 `/create` 或登录前的 `next` 路径。
- `OAuthAccount` 中保存 provider 和 providerAccountId，用于下次登录直接绑定同一用户。

未配置时：

- Google / GitHub 登录会提示尚未配置。
- 邮箱登录不受影响。

### 10. 管理后台与举报

配置：

```text
ADMIN_EMAILS=creator@example.com
```

打开：

```text
http://localhost:3000/admin
```

预期：

- 非管理员访问 `/admin` 会跳转登录。
- 管理员能看到游戏列表、待处理举报、最近生成任务和审计日志。
- 游戏详情页可提交举报。
- 管理后台可将游戏下架为 `ARCHIVED`，下架后首页和详情页不再公开展示。
- 管理后台可恢复发布游戏，并写入 `AdminAuditLog`。
- 管理后台可将举报标记为已处理或驳回。

### 11. LLM 可选接入

配置：

```text
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-5.5
MODEL_WIRE_API=chat
OUTBOUND_PROXY_URL=http://127.0.0.1:7897
```

飞书 GPT 5.5 API 可使用：

```text
OPENAI_BASE_URL=http://43.106.115.130:8080/v1
MODEL_NAME=gpt-5.5
MODEL_WIRE_API=responses
```

预期：

- 有 Key 时 Planner/Coder 优先调用模型。
- 无 Key 或模型调用失败时自动 fallback。
- AgentLog 中会记录模型来源或 fallback 行为。
- 任务历史会显示估算 token 和成本。
- fallback 模式下，不同 prompt 会选择不同玩法模板，例如收集、点击反应、追逐或躲避。

## 已知风险

- 未配置模型 Key 时生成器为 fallback；配置 OpenAI-compatible API 后可真实调用模型。
- 需要同时启动 Web dev server 和 Worker。
- MinIO 的本地公开访问策略依赖 `minio-init` 容器初始化。
- Windows 上 `npx prisma generate` 可能因为 query engine DLL 文件锁失败，关闭占用进程后重跑即可。

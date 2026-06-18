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
```

结果：通过。

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
- Worker 处理后状态变为 `SUCCEEDED`。

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
- 能看到 `games/{jobId}/index.html`、`manifest.json` 和 `cover.svg`。

### 5. Play

从首页进入生成游戏详情页，点击“开始游玩”。

预期：

- Play 页展示 Manifest 地址和 iframe 入口。
- iframe 加载 MinIO 中的远端 HTML 游戏。
- 可以用方向键或 WASD 控制飞船。
- 数据库中 `playCount` 自增，并写入 `GameEvent`。

## 已知风险

- 当前没有真实 LLM API 调用，生成器为 fallback。
- 需要同时启动 Web dev server 和 Worker。
- MinIO 的本地公开访问策略依赖 `minio-init` 容器初始化。

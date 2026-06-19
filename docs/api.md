# 核心接口文档

## 认证接口

### POST `/api/auth/register`

用途：注册邮箱账号，成功后自动创建 session 并跳转到 `/create`。

表单字段：

- `name`：可选，昵称。
- `email`：必填，邮箱。
- `password`：必填，至少 8 位。

行为：

- 校验邮箱和密码。
- 检查邮箱是否已注册。
- 使用 bcrypt hash 密码。
- 写入 `User`。
- 创建 `Session` 和 httpOnly cookie。

### POST `/api/auth/login`

用途：邮箱登录。

表单字段：

- `email`：必填。
- `password`：必填。
- `next`：可选，登录后跳转路径。

行为：

- 校验账号密码。
- 创建 `Session`。
- 设置 httpOnly cookie。
- 使用 303 重定向到 `next` 或首页。

### POST `/api/auth/logout`

用途：退出登录。

行为：

- 删除当前 session。
- 清除 cookie。
- 重定向回首页。

### GET `/api/auth/github/start`

用途：发起 GitHub OAuth 登录。

行为：

- 检查 `GITHUB_CLIENT_ID`。
- 创建 OAuth state cookie 和登录后跳转 cookie。
- 重定向到 GitHub 授权页。

### GET `/api/auth/github/callback`

用途：处理 GitHub OAuth 回调。

行为：

- 校验 state。
- 交换 access token。
- 获取 GitHub 用户和邮箱。
- 根据 `OAuthAccount` 查找或绑定本地用户。
- 创建 session。

### GET `/api/auth/google/start`

用途：发起 Google OAuth 登录。

行为：

- 检查 `GOOGLE_CLIENT_ID`。
- 创建 OAuth state cookie 和登录后跳转 cookie。
- 重定向到 Google 授权页，请求 `openid email profile` scope。

### GET `/api/auth/google/callback`

用途：处理 Google OAuth 回调。

行为：

- 校验 state。
- 交换 access token。
- 读取 OpenID Connect userinfo。
- 要求 Google 邮箱已验证。
- 根据 `OAuthAccount(provider="google")` 查找或绑定本地用户。
- 创建 session。

## 生成任务接口

### POST `/api/generation-jobs`

用途：创建 AI 游戏生成任务。

表单字段：

- `prompt`：必填，至少 10 个字符。
- `assets`：可选，多文件上传。

行为：

- 读取当前登录用户，未登录跳转到 `/login?next=/create`。
- 创建 `GenerationJob`，初始状态为 `PENDING`。
- 写入第一条 `AgentLog`。
- 上传输入文件到 MinIO。
- 创建 `UploadedAsset` 记录。
- 将上传文件摘要写回 `GenerationJob.inputFiles`。
- 303 重定向回 `/create?job=<jobId>`。

### POST `/api/generation-jobs/[id]/retry`

用途：重试失败任务。

行为：

- 只允许任务 owner 操作。
- 只允许 `FAILED` 状态任务重试。
- 将任务状态重置为 `PENDING`，进度归零。
- 写入 `job_retried` 日志。

## 游戏互动接口

### POST `/api/games/[id]/like`

用途：登录用户点赞或取消点赞游戏。

行为：

- 未登录跳转登录。
- 已点赞则取消。
- 未点赞则创建 `GameLike`。

### POST `/api/games/[id]/favorite`

用途：登录用户收藏或取消收藏游戏。

行为：

- 未登录跳转登录。
- 已收藏则取消。
- 未收藏则创建 `GameFavorite`。

## 页面数据流

### Home `/`

从 PostgreSQL 查询 `PUBLISHED` 状态的 `Game`，展示：

- 封面
- 标题
- 作者
- 简介
- 标签
- 发布时间
- 游玩次数

支持：

- 关键词搜索
- 标签筛选
- 最新发布、最多游玩、最多点赞排序

### Game Detail `/games/[slug]`

根据 slug 查询已发布游戏，展示游戏 meta 和 Play 入口。

### Play `/play/[id]`

流程：

1. 根据 id 查询 `Game`。
2. 从 `game.manifestUrl` 拉取远端 Manifest。
3. 使用 `remoteGameManifestSchema` 校验协议。
4. 写入 `GameEvent`。
5. `Game.playCount` 自增。
6. 用 `iframe sandbox` 加载 `manifest.entryUrl`。

## 错误处理

- 表单错误通过 query string 显示在页面。
- Worker 错误会把 `GenerationJob.status` 设置为 `FAILED`，并写入 `AgentLog`。
- Manifest 加载失败时，Play 页面显示错误面板，并记录 `PLAY_ERROR` 事件。

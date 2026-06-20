# AI 协作记录

## 使用工具

本项目开发过程中主要使用：

- Cursor IDE
- GPT-5.5
- GitHub OAuth / Google OAuth 文档
- 飞书 GPT 5.5 API 接入文档

AI 主要承担：

- 需求拆解和验收项对齐
- 代码生成和重构建议
- Agent 工作流设计
- Prisma 数据模型扩展
- Next.js 页面和 API 实现
- 文档整理
- 测试命令和错误排查建议

人工主要承担：

- 产品判断和优先级选择
- 本地运行、页面手工验收
- OAuth App 配置和密钥管理
- 真实 API Key 配置
- 对生成结果进行体验反馈和修正方向确认

## 关键协作过程

### 1. 核心闭环实现

目标：

```text
登录/注册 -> Create -> Agent 生成 -> MinIO 发布 -> Home 展示 -> Play 远端加载
```

AI 协助完成：

- Next.js App Router 页面结构
- 邮箱登录注册和 session cookie
- Prisma 数据模型
- MinIO 上传工具
- Worker 轮询生成任务
- Manifest 协议和 iframe sandbox Play 页面

人工验证：

- 本地启动 Docker Compose
- 手动注册/登录
- 手动创建游戏
- 在 MinIO 中检查 `index.html`、`manifest.json`、`cover.svg`

### 2. Agent 工作流扩展

目标：

- 任务过程可见
- 支持多 Agent
- 能证明不是单次黑盒调用

AI 协助完成：

- `AssetAnalyzerAgent`
- `PlannerAgent`
- `CoderAgent`
- `ReviewerAgent`
- `PublisherAgent`
- `CostAgent`
- `AgentLog` 写入
- LangGraph `StateGraph` 编排

人工反馈：

- 希望接入 LangGraph，让 Agent 编排更专业。
- 希望 Create 页面看到更清晰的 Agent 流程。

最终实现：

```text
START -> asset_analyzer -> planner -> coder -> reviewer -> publisher -> cost -> END
```

### 3. 多模态素材处理

目标：

- Create 支持上传图片/文件/视频
- 上传素材能被任务引用
- 图片尽量真正被模型理解并进入游戏

AI 协助完成：

- 文件上传到 MinIO
- `UploadedAsset` 入库
- `AssetAnalyzerAgent` 读取素材信息
- 图片尺寸解析
- GPT 5.5 vision input 测试
- 图片视觉摘要写入 AgentLog
- 上传图片 URL 写入 Manifest `assets`
- fallback 模板直接使用上传图片作为玩家角色

人工反馈：

- 指出 LLM 错误地生成了“游戏内上传图片”控件。
- 要求改成使用 Create 阶段已上传图片。

修复：

- CoderAgent prompt 禁止 `<input type="file">`、`FileReader`、`createObjectURL`。
- 增加 HTML guardrail，发现游戏内上传控件时拒绝 LLM HTML 并 fallback。

### 4. OAuth 接入

目标：

- GitHub / Google OAuth 设计和实现
- 至少真实跑通一个

AI 协助完成：

- GitHub OAuth start/callback
- Google OAuth start/callback
- `OAuthAccount(provider, providerAccountId)` 数据模型
- OAuth state cookie
- 登录后 `next` 回跳
- 服务端请求代理 `OUTBOUND_PROXY_URL`

人工修复和验证：

- 配置 GitHub OAuth App。
- 修正 Client ID 复制错误。
- 生成新的 Client Secret。
- 确认 GitHub OAuth 授权链路真实跑通。

典型问题：

- 浏览器能访问 GitHub，但 Node 服务端 token 请求超时。
- 解决方式：用 `undici ProxyAgent` 实现 `outboundFetch`。

### 5. Play 体验修复

目标：

- 不要进入 Play 页面后游戏自动开始并快速失败
- 不需要刷新页面才能重玩
- 键盘操作尽量稳定

AI 协助完成：

- `PlayFrame` 客户端组件
- 准备开始 overlay
- iframe 加载中/超时/错误状态
- 重新开始按钮
- iframe onLoad/onError 埋点
- 父页面键盘事件转发到 iframe

人工反馈：

- 指出自动开始导致来不及操作。
- 指出需要点击 iframe 后 WASD 才生效。
- 指出游戏内应有重新开始入口。

修复：

- iframe 延迟挂载，点击开始后才加载。
- 父页面通过 `postMessage` 转发键盘事件。
- fallback 模板和 Play 容器都支持重新开始。

### 6. 管理后台和治理

目标：

- 响应“平台维护者”角色
- 管理不当内容

AI 协助完成：

- `ADMIN_EMAILS`
- `/admin`
- 游戏下架/恢复
- 举报提交
- 举报处理/驳回
- `GameReport`
- `AdminAuditLog`
- 最近生成任务观察

人工需求：

- 希望平台维护者可以管理平台内容，例如删除或下架不当游戏。

实现选择：

- 使用 `ARCHIVED` 下架，而不是物理删除，便于保留审计记录和对象存储证据。

## AI 贡献比例

粗略估计：

- AI 生成和改写代码：约 60%
- AI 生成和维护文档：约 70%
- 人工产品判断、调试反馈、验收和配置：约 40%

实际关键质量来自人机协作：

- AI 快速实现工程代码。
- 人工不断用真实页面测试，发现体验问题。
- AI 根据反馈修复并补文档。

## 人工修复过的典型问题

1. Prisma Client 在 Windows 上因为 DLL 文件锁导致 `npx prisma generate` 失败。
2. GitHub OAuth Client ID 复制混淆导致 GitHub 404。
3. Node 服务端访问 GitHub API 未走浏览器代理，导致 token 请求超时。
4. iframe sandbox 阻止生成游戏使用 `localStorage`。
5. LLM 生成了游戏内上传文件控件，不符合 Create 上传素材链路。
6. Worker 未启动导致生成任务一直 0%。
7. 旧 Worker 未重启导致新 guardrail 没生效。

## Review 和 Test 方法

每轮较大改动后执行：

```bash
npm run typecheck
npm run build
npx prisma validate
npx prisma migrate status
```

并使用 Cursor lints 检查新增文件。

手工验收覆盖：

- 邮箱注册/登录/退出
- GitHub OAuth
- Create 生成任务
- Worker 生成
- MinIO 产物
- Play 远端加载
- 上传图片作为游戏素材
- Remix
- 管理后台下架/恢复
- 举报处理

## 后续可改进

- 引入阶段级重试和任务取消。
- LangGraph 增加 review-revise loop。
- ReviewerAgent 增加 AST/HTML 静态扫描。
- 成本统计接入模型 API 返回的真实 `usage`。
- Worker 改为 Redis + BullMQ 或云队列。
- 部署到线上环境并录制演示视频。

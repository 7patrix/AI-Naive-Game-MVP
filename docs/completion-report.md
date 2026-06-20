# 完成度说明

## 已完成

### 登录注册

- 邮箱注册
- 邮箱登录
- 退出登录
- 密码哈希存储
- session cookie
- Create 页面访问控制

### Home

- 从 PostgreSQL 读取所有已发布游戏。
- 展示封面、标题、作者、简介、标签、发布时间和游玩次数。
- 支持搜索标题、简介、作者和标签。
- 支持标签筛选。
- 支持按最新发布、最多游玩、最多点赞排序。
- seed 数据包含 3 个示例游戏。
- Create 流程生成的新游戏会自动出现在首页。

### Create

- 支持文字创意输入。
- 支持多文件上传。
- 上传文件进入 MinIO。
- `AssetAnalyzerAgent` 会分析上传素材，提取图片尺寸、文本摘要、文件类型、大小和对象存储 URL；配置 vision-capable Responses API 后，图片会生成视觉摘要。
- 上传图片可以作为运行时素材直接进入游戏 HTML，例如作为玩家角色贴图，并写入 Manifest `assets`。
- 创建前执行轻量内容审核和资源限额检查。
- 创建 `GenerationJob`。
- 展示任务状态、进度、上传文件、审核结果、估算成本和 Agent 日志。
- 有运行中任务时自动刷新页面。
- 失败任务支持重试。
- 任务完成后展示 Manifest 和 Bundle 产物地址。
- Worker 异步处理生成任务。

### Agent 工作流

- `AssetAnalyzerAgent`
- `PlannerAgent`
- `CoderAgent`
- `ReviewerAgent`
- `PublisherAgent`
- `CostAgent`

Worker 使用 LangGraph `StateGraph` 编排这些 Agent 节点，每个阶段都会写入 `AgentLog`。

### 发布与对象存储

- 生成 HTML Canvas 小游戏。
- 生成 `manifest.json`。
- 生成 SVG 封面。
- 上传到 MinIO。
- 创建 `PUBLISHED` 状态的 `Game` 记录。
- 写入 `GameVersion` v1 版本记录。

### Play

- 从数据库读取 Game meta。
- 拉取远端 Manifest。
- 校验 Manifest 协议。
- 使用 iframe sandbox 运行远端 HTML 游戏。
- 展示 iframe 加载中、加载超时和错误提示。
- iframe 实际加载成功或失败后写入 `GameEvent`。
- `playCount` 自增。
- 详情页展示 `PLAY_START`、`PLAY_LOADED`、`PLAY_ERROR` 统计。

### 产品加分项

- 游戏点赞。
- 游戏收藏。
- 游戏举报。
- 管理后台：游戏下架/恢复发布、举报处理、生成任务观察和审计日志。
- 详情页最近游玩事件展示。
- Google / GitHub OAuth 可配置接入。
- OAuth 账号绑定使用统一 `OAuthAccount` 数据模型，可继续扩展其他 provider。
- OpenAI-compatible LLM 可选接入，失败自动 fallback。
- Remix 派生：详情页可基于已发布游戏创建 Remix 任务。
- 版本管理：`GameVersion` 记录 Manifest、Bundle、封面和变更说明。
- 生成成本统计：记录估算 token 和成本。
- 轻量内容审核：敏感词命中会阻止任务进入 Worker。
- 资源限额：限制并发任务、每日任务数、文件数量和上传大小。
- Play 加载体验优化：iframe loading overlay、超时提示和客户端真实加载埋点。

## Mock / fallback 部分

当前默认不强依赖真实 LLM API。游戏生成优先尝试 OpenAI-compatible 模型；未配置 Key 或模型失败时使用本地 fallback generator，原因是：

- 确保 Demo 在没有 API Key 时稳定运行。
- 避免模型输出不可控导致短周期演示失败。
- 先验证完整工程链路，包括任务、日志、对象存储、发布和远端运行。
- fallback 会根据 prompt 选择躲避、收集、点击反应、追逐等玩法模板，不是固定单一假数据。

但系统已经保留真实模型接入点：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `MODEL_NAME`
- `OUTBOUND_PROXY_URL`
- `PlannerAgent`
- `CoderAgent`

## 未完成

- 生产级代码沙箱。
- 自动化测试覆盖。

## 如果再给 1 周

优先迭代：

1. 扩展真实 LLM 生成质量，让 Planner/Coder 产出更丰富的玩法和代码。
2. 增加 Reviewer 的静态安全扫描和 smoke test。
3. 引入 Redis + BullMQ 替代数据库轮询。
4. 增加任务取消、重新生成和版本回滚。
5. 强化 Remix 差异对比和父子作品图谱。
6. 增加更严格的内容审核、成本预算、批量治理和管理员角色体系。
7. 增加部署流水线和线上 Demo。
8. 增加端到端测试和截图验证。

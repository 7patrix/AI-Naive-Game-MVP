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
- seed 数据包含 3 个示例游戏。
- Create 流程生成的新游戏会自动出现在首页。

### Create

- 支持文字创意输入。
- 支持多文件上传。
- 上传文件进入 MinIO。
- 创建 `GenerationJob`。
- 展示任务状态、进度、上传文件和 Agent 日志。
- Worker 异步处理生成任务。

### Agent 工作流

- `PlannerAgent`
- `CoderAgent`
- `ReviewerAgent`
- `PublisherAgent`

每个阶段都会写入 `AgentLog`。

### 发布与对象存储

- 生成 HTML Canvas 小游戏。
- 生成 `manifest.json`。
- 生成 SVG 封面。
- 上传到 MinIO。
- 创建 `PUBLISHED` 状态的 `Game` 记录。

### Play

- 从数据库读取 Game meta。
- 拉取远端 Manifest。
- 校验 Manifest 协议。
- 使用 iframe sandbox 运行远端 HTML 游戏。
- 写入 `GameEvent`。
- `playCount` 自增。

## Mock / fallback 部分

当前没有接入真实 LLM API。游戏生成使用本地 fallback generator，原因是：

- 确保 Demo 在没有 API Key 时稳定运行。
- 避免模型输出不可控导致短周期演示失败。
- 先验证完整工程链路，包括任务、日志、对象存储、发布和远端运行。

但系统已经保留真实模型接入点：

- `OPENAI_API_KEY`
- `MODEL_NAME`
- `PlannerAgent`
- `CoderAgent`

## 未完成

- Google/GitHub OAuth 真实接入。
- 搜索和标签筛选。
- 点赞、收藏。
- Remix 派生。
- 版本管理。
- 失败重试 UI。
- 生成成本统计。
- 内容审核。
- 生产级代码沙箱。
- 自动化测试覆盖。

## 如果再给 1 周

优先迭代：

1. 接入真实 LLM，让 Planner/Coder 使用模型生成游戏规格和代码。
2. 增加 Reviewer 的静态安全扫描和 smoke test。
3. 引入 Redis + BullMQ 替代数据库轮询。
4. 增加任务失败重试、取消和重新生成。
5. 增加游戏版本管理和 Remix。
6. 增加搜索、标签筛选、点赞收藏。
7. 增加部署流水线和线上 Demo。
8. 增加端到端测试和截图验证。

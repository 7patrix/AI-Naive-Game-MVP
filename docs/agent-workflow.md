# Agent 工作流

## 总览

生成系统由 `GenerationJob` 和独立 Worker 驱动。用户在 Create 页面提交创意后，请求不会同步等待游戏生成完成，而是先创建任务，再由 Worker 异步处理。

```text
PENDING -> RUNNING -> SUCCEEDED / FAILED
```

每个阶段都会写入 `AgentLog`，便于在 Create 页面展示执行过程。

## Worker 流程

1. 轮询最早的 `PENDING` 任务。
2. 将任务状态改为 `RUNNING`，进度设为 10。
3. 执行 AssetAnalyzer、Planner、Coder、Reviewer、Publisher、Cost。
4. 成功后状态改为 `SUCCEEDED`，进度 100。
5. 失败后状态改为 `FAILED`，记录错误信息。

## Agent 角色

### AssetAnalyzerAgent

职责：

- 读取 `GenerationJob.inputFiles` 和上传素材记录。
- 对图片素材尽量解析尺寸，对文本素材提取前若干字符，对视频/音频记录类型、大小和 URL。
- 将素材分析结果写入 `AgentLog`，并作为上下文传给 Planner/Coder。

当前实现：

- 图片：支持解析 PNG、GIF、JPEG 尺寸；配置 `MODEL_WIRE_API=responses` 和模型 Key 后，会调用 vision input 生成视觉摘要。
- 文本：读取对象存储中的文本内容片段。
- 视频/音频/其他文件：记录文件名、MIME、大小、对象存储 URL 和用途提示。
- 如果 vision 调用失败，会保留文件元信息和尺寸分析作为兜底，不阻塞生成任务。

### PlannerAgent

职责：

- 读取用户 prompt。
- 读取 Remix 源游戏和源版本上下文。
- 读取 AssetAnalyzer 输出的素材上下文。
- 生成游戏标题、类型、核心玩法、简介和标签。
- 形成后续代码生成所需的结构化规格。

当前实现：

- 优先使用 OpenAI-compatible 模型生成结构化 `GameSpec`。
- 未配置模型或模型失败时，使用本地 fallback 逻辑生成 `GameSpec`。
- fallback 会根据 prompt 关键词选择躲避、收集、点击反应、追逐等玩法模板。

生产扩展：

- 可接入 LLM，将 prompt、上传素材摘要和平台约束输入模型，生成更完整的游戏设计文档。

### CoderAgent

职责：

- 根据游戏规格规划 Web 游戏产物结构。
- 输出 `index.html`、`manifest.json` 等 bundle 计划。
- 可使用 AssetAnalyzerAgent 提供的上传素材 `publicUrl` 作为游戏内图片/音频素材。

当前实现：

- 使用模板生成 Canvas 小游戏 HTML。

生产扩展：

- 可接入 LLM 生成 HTML/CSS/JS。
- 生成后进入静态规则检查和沙箱验证。
- 上传素材 URL 会被限制在本任务 MinIO 产物范围内，不允许模型任意加载外部资源。

### ReviewerAgent

职责：

- 检查生成产物是否符合安全规则和平台协议。

当前实现：

- 写入基础检查结果，例如禁止外链脚本、要求 sandbox、限制文件数量。

生产扩展：

- AST 扫描危险 API。
- 限制网络请求、弹窗、无限循环和资源大小。
- 在隔离环境中执行 smoke test。

### PublisherAgent

职责：

- 生成最终 HTML、Manifest 和封面。
- 上传产物到 MinIO。
- 创建 `Game` 记录并标记为 `PUBLISHED`。
- 创建 `GameVersion` 记录，保存当前版本的远端产物地址。

当前实现：

- 真实上传：
  - `games/{jobId}/v1/index.html`
  - `games/{jobId}/v1/manifest.json`
  - `games/{jobId}/v1/cover.svg`
- 写入：
  - `Game.manifestUrl`
  - `Game.bundleUrl`
  - `Game.coverUrl`
  - `Game.createdByJobId`
  - `Game.parentGameId`
  - `Game.sourceVersionId`
  - `GameVersion`
- Manifest `assets` 会包含封面 URL 和本任务上传素材 URL，用于证明游戏运行时素材来自对象存储。

### CostAgent

职责：

- 估算 prompt、规格和生成产物的 token 数。
- 根据是否使用 LLM 记录本地 fallback 或 OpenAI-compatible 估算成本。
- 写入 `GenerationJob.modelInputTokens`、`modelOutputTokens` 和 `estimatedCostCents`。

### ModerationAgent

职责：

- 在 Create API 入库时执行轻量内容审核。
- 命中敏感词时将任务标记为 `FAILED`，不进入 Worker 队列。
- 通过时写入 `moderationStatus` 和审核报告。

## 模型接入说明

当前 MVP 不强依赖外部 LLM API。配置模型环境变量后，`PlannerAgent` 和 `CoderAgent` 会优先调用 OpenAI-compatible Chat Completions API；未配置或调用失败时，自动使用 fallback generator，保证 Demo 稳定运行。

预留环境变量：

```text
OPENAI_API_KEY=""
OPENAI_BASE_URL=https://api.openai.com/v1
MODEL_NAME="gpt-5.5"
OUTBOUND_PROXY_URL=http://127.0.0.1:7897
```

`OUTBOUND_PROXY_URL` 是可选项，用于本地 Node.js 服务端访问模型 API 或 OAuth API 时走代理。模型请求通过统一的 `outboundFetch` 发送，因此代理配置会同时作用于模型调用和第三方登录回调。

后续接入时建议：

1. PlannerAgent 调模型生成结构化 `GameSpec`。
2. CoderAgent 调模型生成代码。
3. ReviewerAgent 结合规则和模型 review。
4. PublisherAgent 保持工程发布边界不变。

这样即使更换模型供应商，也不会影响对象存储、数据库、Play 协议和发布流程。

## 日志标记

AgentLog 会记录当前阶段使用的来源：

- `llm`：真实模型生成。
- `fallback`：本地生成器生成。

如果模型调用失败，会额外写入 `llm_fallback` 日志，说明失败原因和回退行为。

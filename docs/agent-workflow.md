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
3. 执行 Planner、Coder、Reviewer、Publisher。
4. 成功后状态改为 `SUCCEEDED`，进度 100。
5. 失败后状态改为 `FAILED`，记录错误信息。

## Agent 角色

### PlannerAgent

职责：

- 读取用户 prompt。
- 生成游戏标题、类型、核心玩法、简介和标签。
- 形成后续代码生成所需的结构化规格。

当前实现：

- 使用本地 fallback 逻辑生成 `GameSpec`。

生产扩展：

- 可接入 LLM，将 prompt、上传素材摘要和平台约束输入模型，生成更完整的游戏设计文档。

### CoderAgent

职责：

- 根据游戏规格规划 Web 游戏产物结构。
- 输出 `index.html`、`manifest.json` 等 bundle 计划。

当前实现：

- 使用模板生成 Canvas 小游戏 HTML。

生产扩展：

- 可接入 LLM 生成 HTML/CSS/JS。
- 生成后进入静态规则检查和沙箱验证。

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

当前实现：

- 真实上传：
  - `games/{jobId}/index.html`
  - `games/{jobId}/manifest.json`
  - `games/{jobId}/cover.svg`
- 写入：
  - `Game.manifestUrl`
  - `Game.bundleUrl`
  - `Game.coverUrl`
  - `Game.createdByJobId`

## 模型接入说明

当前 MVP 没有调用外部 LLM API，默认使用 fallback generator 保证 Demo 在无 API Key、无网络、无额度的情况下稳定运行。

预留环境变量：

```text
OPENAI_API_KEY=""
MODEL_NAME="gpt-5.5"
```

后续接入时建议：

1. PlannerAgent 调模型生成结构化 `GameSpec`。
2. CoderAgent 调模型生成代码。
3. ReviewerAgent 结合规则和模型 review。
4. PublisherAgent 保持工程发布边界不变。

这样即使更换模型供应商，也不会影响对象存储、数据库、Play 协议和发布流程。

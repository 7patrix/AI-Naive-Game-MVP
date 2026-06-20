# 安全方案

## 目标

本 MVP 需要运行由生成系统产出的前端游戏文件，因此安全重点是：不要让生成游戏代码污染主站、不要把用户上传文件当作可信内容、不要把对象存储和数据库边界混在一起。

## 当前实现

### 登录与会话

- 密码使用 bcrypt hash 后存储。
- session token 只在浏览器保存原文，数据库保存 sha256 hash。
- session cookie 设置为 `httpOnly` 和 `sameSite=lax`。
- `/create` 是受保护页面，未登录会跳转到 `/login?next=/create`。
- `/admin` 通过 `ADMIN_EMAILS` 限制管理员访问。
- Google / GitHub OAuth 使用 state cookie 防 CSRF。
- OAuth 账号使用 `OAuthAccount(provider, providerAccountId)` 绑定到本地用户。
- 管理员下架/恢复游戏、处理举报时会写入 `AdminAuditLog`。

### 对象存储边界

- 用户上传文件和生成游戏产物都上传到 MinIO。
- 应用代码通过 S3 兼容 SDK 写入对象存储。
- 数据库只保存 meta 和 URL，不用本地文件目录模拟对象存储。

当前路径约定：

```text
uploads/{userId}/{jobId}/{filename}
games/{jobId}/index.html
games/{jobId}/manifest.json
games/{jobId}/cover.svg
```

### Play 沙箱

Play 页不会把生成代码 import 到主应用中执行，而是：

1. 从数据库读取 `Game.manifestUrl`。
2. 拉取并校验远端 Manifest。
3. 使用 iframe 加载 `manifest.entryUrl`。
4. iframe 使用 sandbox：

```text
sandbox="allow-scripts allow-same-origin allow-pointer-lock"
```

这能隔离生成游戏代码和主站 React 应用，同时允许远端对象存储 origin 下的游戏使用自己的 `localStorage` 保存最高分等轻量状态。生成游戏仍不能直接访问主站 cookie 或 React 运行时。

### Manifest 协议校验

Play 页使用 `remoteGameManifestSchema` 校验远端 JSON，要求：

- `schemaVersion` 必须是 `1.0`
- `entryUrl` 和 `bundleUrl` 必须是 URL
- `permissions` 只能包含 `keyboard` 和 `pointer`
- 必须包含 `createdByJobId`

## 当前限制

- 内容审核仍是轻量规则，未接入生产级审核服务。
- 还没有静态 AST 安全扫描。
- 运行时资源限额仍是基础规则，未做到浏览器级 CPU/内存隔离。
- 还没有真实隔离容器或 VM。
- 当前生成器是本地 fallback，不会生成任意外部模型代码，因此风险较低。
- Google / GitHub OAuth 需要用户自己配置 OAuth App 和回调地址。

## 生产级扩展

如果接入真实 LLM 生成代码，建议增加：

- 静态扫描：禁止 `eval`、外链脚本、危险 DOM API、任意网络请求。
- 资源限制：限制 bundle 大小、资源数量、运行时 CPU/内存。
- CSP：限制 iframe 中可访问的资源域名。
- 隔离执行：在容器、VM、Firecracker 或浏览器沙箱中做 smoke test。
- 内容审核：对 prompt、上传素材、生成标题和描述做文本/图片审核。
- 审计日志：保留生成输入、模型输出摘要、安全检查结果和发布记录。
- OAuth 扩展：沿用 `OAuthAccount` 模型，新增 provider 名称和 start/callback 路由，回调后按 providerAccountId 或邮箱绑定账号。

# Godot 作品工作台：本地实现与上线前验收

本轮把 Duckmole 扩展为单作者的 Godot Web 作品发布平台。入口为 `/studio`，沿用现有账户及 `ADMIN_EMAILS` 授权。游戏继续在 Godot 中开发；网站负责接收导出包、私密试玩、版本记录与公开版本切换。

## 已实现的流程

1. 管理员登录后上传完整 Web 导出 ZIP，填写作品资料、Godot 版本和更新说明。首次上传创建作品和 v1 草稿。
2. 工作台为指定版本签发一次性预览入口（60 秒内使用），换取该版本的 HttpOnly Cookie（20 分钟有效）。草稿资源只允许作品作者的有效预览会话访问。
3. 同一作品上传新包会分配递增版本号，保留旧版本；不会自动替换正在公开的版本。
4. 作者实际试玩后勾选确认，再发布指定版本。数据库事务更新公开版本指针、作品资料和审计记录。旧版本可重新设为公开版本，以便回滚。
5. 匿名访问只读取当前公开版本。历史版本和草稿需作者预览授权。撤销预览会使该版本已有授权失效；已经加载到浏览器内存的游戏不能远程收回。

发布确认表示作者声明已经试玩，并非服务端证明游戏已正常运行。当前没有自动 Godot 运行验收。单人/多人字段仅记录计划；房间、邀请、实时服务器、云存档和内置编辑器尚未实现。

发布前会读取所有构建对象，检查密文认证、长度和内容哈希；缺失或损坏时保留原公开版本。资源检查在数据库锁之外进行，事务内再核对清单没有变化。每个对象读取设有 20 秒超时；实际导出包大小、存储延迟和代理请求时限仍需一起验收。检查完成后存储仍可能发生故障，因此桶访问策略和备份不可省略。

同一作者最多保留 8 个有效预览会话，计数、清理和签发使用作者级数据库锁。未启用的入口超过 60 秒后会在下一次签发时释放名额；已启用会话保持 20 分钟有效。撤销操作使用同一作者锁。

## 导出包要求

- Godot 4 Web 使用 Compatibility 渲染器，导出文件名为 `index.html`。同目录必须包含 `index.js`、`index.wasm`、`index.pck`，辅助文件原样打包。
- 本轮只支持单线程、不启用扩展及 PWA 的导出。Godot 4 的 C# 项目不能直接导出 Web。引擎实际版本兼容性仍需用真实作品验收。
- ZIP 可包含一层外部文件夹；只接受普通 Stored/DEFLATE ZIP，拒绝 ZIP64、加密包、链接和特殊文件。
- 文件名使用英文安全字符。压缩包最多 32 MiB，单文件最多 64 MiB，解压总量最多 128 MiB，最多 128 个条目（包括目录）。大于 1 MiB 且压缩比超过 100 倍的条目会被拒绝。
- 不解压到磁盘；检查本地与中央目录、CRC、声明尺寸、重叠区域、路径和 WASM 文件头。检查不能证明上传的 JavaScript 是可信代码，因此资源隔离始终必须启用。

## 隔离与私密资源

新增配置变量：

| 名称 | 用途 |
| --- | --- |
| `APP_URL` | 用户访问主站的正式 HTTPS 来源 |
| `GAME_RUNTIME_URL` | 游戏资源的基础 HTTPS 来源，仅根地址，例如 `https://play.example.test` |
| `GAME_BUILD_ENCRYPTION_SECRET` | 稳定、高熵、至少 32 字节的独立构建加密密钥，由部署方通过秘密管理系统注入 |

不在仓库提交真实配置或密钥。每个作品使用稳定的独立来源 `https://g-{game UUID}.play.example.test`。部署方需配置通配 DNS 和 TLS，并将这些主机路由到同一应用。反向代理必须保留并验证 Host、外部协议，禁止绕过应用直接开放构建对象。资源主机只允许 `/runtime/bootstrap` 和 `/runtime/builds/...`；主站不提供这两个资源入口。

建议游戏资源使用与主站不同的可注册域名，避免旧接口的同站 Cookie/CSRF 风险。现有登录 Cookie 为 HttpOnly、SameSite=Lax、仅主站主机，新增工作台写入还检查精确 Origin。仅有不同子域不等于完全不同站点；上线前还应审查旧 HTML 游戏及旧写入接口。

每个文件以 AES-256-GCM 加密后放入 S3 兼容存储，密文与作品、版本及对象标识绑定。资源响应必须通过授权、解密和长度/哈希校验。即使旧存储桶可公开读，也不会暴露明文草稿；仍应限制新前缀的桶访问策略。更换密钥前必须完成迁移，否则旧构建无法解密。数据库、构建对象和密钥必须一起纳入备份与恢复演练。

响应使用 no-store、正确 MIME、nosniff、CSP 和禁用 worker 的策略。现有 HTML 游戏仍走旧流程；Godot 路由不会回落到主站的旧 HTML bundle 接口。当前 CSP 禁止外部联网，因此计划中的 WSS/WebRTC 联机需要单独实现与审查，不能仅填写“多人”即获得联机能力。

跨站 iframe 的预览 Cookie 可能被浏览器拦截，播放器提供“在新窗口打开”以便直接进入资源来源。HTTPS 预览 Cookie 使用 SameSite=None+Secure；本地 HTTP 只用于检查，不能代表生产浏览器行为。预览入口 URL 含一次性授权，代理及应用日志必须隐藏 bootstrap 查询参数；应用不会打印该令牌。不要共享入口 URL。

同一作品各版本的资源来源保持稳定，以支持浏览器侧存档延续。但 Godot 的 IndexedDB/user:// 路径、工程名称和存档格式变化仍可能影响兼容性；平台没有实现云存档，也不能保证浏览器保存数据不被清理。

## 迁移和部署准备（尚未执行生产操作）

1. 在隔离测试数据库和测试桶配置安全值，执行现有 Prisma 部署流程，应用 `20261006000100_godot_builds` 迁移并生成 Prisma Client。迁移默认把旧作品视为 HTML，旧版本视为 PUBLISHED，保留旧数据。
2. 验证迁移 SQL、数据库备份与恢复，再安排正式迁移。不可仅上线代码而不迁移：工作台查询依赖新增字段和表。
3. 为基础资源来源及 `g-*` 主机配置 HTTPS、Host 路由和日志脱敏。上传层（CDN/代理/平台）至少允许 33 MiB 请求体；Next Proxy 配置上限为 34 MiB。
4. 保持构建密钥稳定，验证测试桶 Put/Get/Delete 权限。检查失败上传的孤立密文对象；删除失败只记录通用提示。使用默认只读的[构建资源对账](godot-operations.md)记录原因与证据；没有上传租约和原子快照时，未被引用不能证明资源可删除。本切片不执行清理。
5. 用实际 Godot 包完成以下验收，再决定是否上线。

## 必须完成的真实验收

- 未登录和非作者不能上传、预览或发布；草稿资源 URL、错误游戏主机、过期/重复使用预览入口、撤销后的 Cookie 均不能获取资源。
- 上传 v1 并私密试玩：WASM/PCK 加载、引擎启动回报、键鼠/触控、音频、全屏、桌面/手机浏览器和新窗口 fallback。
- 导出 v2：旧公开 v1 持续可玩；预览 v2 后发布；再切回 v1。并发上传不能生成重复版本号，事务失败不能留下公开半成品。
- 在同一浏览器验证刷新及升级后的 user:// 存档；在浏览器隐私限制、预览过期和存储损坏时验证错误信息和重试。
- 验证实际 PostgreSQL 事务与迁移、S3 故障清理、HTTPS 反向代理和备份恢复。纯函数测试不替代这些集成验证。

## 代码检查方式

仓库新增 `npm run test:builds`，覆盖 ZIP 攻击、对象加密认证、来源隔离、草稿授权、请求体限制和引擎启动消息桥。可配合 `npx tsc --noEmit --incremental false`、`npx prisma validate` 和 `npm run build` 检查。现有配置加载器会读取当前目录 `.env`；在禁止读取真实环境配置的检查中，应复制源码到没有 `.env` 的隔离目录并提供虚构配置，不从正式仓库启动应用。

第二轮增加 `node tests/run-game-build-routes.cjs`（或 `npm run test:builds:integration`）。它需要本轮使用的 Node 24 模块 mock 能力：创建临时工作目录、清空服务配置、预先 mock 数据库/存储/登录，并阻断依赖读取任何 `.env` 文件。25 项用例直接调用真实路由代码；静态多文件夹具和 mock Engine 明确不是 Godot 游戏。完整结果和未测项见 [godot-review-20261006.md](godot-review-20261006.md)。

官方参考：[Godot Web 导出](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)、[Godot HTML shell API](https://docs.godotengine.org/en/stable/tutorials/platform/web/html5_shell_classref.html)、[iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)。

第三轮补充 `npm run ops:builds:report`（离线元数据、只读报告）、`npm run ops:check-deployment`（仅检查进程配置，不打印 secret）和 `npm run test:builds:ops`。输入契约、保守保留规则、真实 Godot 最小输入与部署验收清单见 [godot-operations.md](godot-operations.md)。当前没有在线采集器或资源删除命令。

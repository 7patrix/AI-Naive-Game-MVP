# Godot 构建资源对账与部署验收

本切片提供离线元数据对账和配置静态检查。工具没有存储删除接口、线上连接参数或默认数据库/S3 客户端。没有读取生产存储、解密对象、读取 `.env`、迁移数据库或部署。

## 为什么现在只能保守报告

当前上传顺序为：写入随机版本前缀下的加密文件，再提交 `GameVersion` 数据库事务。上传失败会尝试删除已经写入的文件；删除本身失败时可能留下孤立密文。数据库和对象清单之间没有原子快照，也没有持久化上传租约。数据库里暂时查不到某个版本，可能只是它仍在上传或提交。

因此，所有报告均为 `READ_ONLY_DRY_RUN`，每组 `safeToDelete` 固定为 `false`，`deleteActions` 固定为空。即使两次观察后成为 `suspected_orphan`，仍需人工确认上传状态、完整数据库备份、对象备份和保留策略；报告不能授权删除。

## 输入与命令

在完整源码工作目录、已有依赖可用时执行：

```text
npm run ops:builds:report -- --snapshot metadata.json --output report-1.json
npm run ops:builds:report -- --snapshot metadata-next-day.json --previous report-1.json --output report-2.json
npm run ops:check-deployment -- --json
npm run test:builds:ops
```

CLI **只读取已经导出的 JSON**，不存在 `--live`、`--delete` 或 `--apply`。输出文件必须是新文件，避免覆盖已有证据。输入上限 32 MiB，最多 20,000 条版本、100,000 条对象；拒绝 `.env*` 文件。报告命令成功退出 0；无效参数、输入或已有输出文件退出 2。部署检查缺项或格式不合格退出 2；退出 0 仅代表静态配置齐备。两条 npm 运维命令都预加载现有 `.env` 读取拦截器。

元数据快照结构以 `src/lib/game-build-reconciliation.ts` 中 `buildSnapshotSchema` 为准：

- `schemaVersion: 1`。
- `capture`：开始/结束 ISO 时间，`databaseComplete`、`storageComplete`、`uploadLeaseCoverage`，分页失败代码和读取尝试次数。
- `versions`：所有 Godot 版本，包括当前公开版本、历史公开版本、草稿和归档作品的版本。字段包含 game/version ID、版本号、作品状态、构建状态、当前版本号、`storagePrefix` 和数据库原始 `files` 清单。不能只导出当前公开版本或当前作者。
- `objects`：`encrypted-builds/` 全部分页的 `key`、密文 `sizeBytes`、`lastModified`，可选 `etag`。无需对象内容。密文长度应为清单明文长度加 32 字节。
- `activeUploads`：仅接受有依据的外部上传租约，包含 game/version ID 和到期时间。**当前上传器没有该数据来源，应设 `uploadLeaseCoverage: "unavailable"`，不能假填 `complete`。**

后续若获授权接入测试环境，可为 `collectBuildSnapshot` 注入只读分页适配器。函数按页重试，默认每页最多 3 次、最多 1,000 页；读取失败、循环游标或分页上限都会保留已读证据并标记不完整。异常只输出稳定代码，不回显服务错误、游标或凭据。当前没有在线适配器，mock 仅验证适配器契约。完整性标志是导出方声明，CLI 无法独立证明它属实。

报告含明确的版本引用、保留原因、识别后的对象路径/长度/时间、清单异常、分页证据和资源指纹；不含密文内容。ETag 只参与哈希；格式异常的存储 key 只输出摘要。正常 key 和作品 ID 仍属于内部运维信息，应按内部资料保存。

## 分类与保留规则

| 状态 | 判断依据与处置 |
| --- | --- |
| `referenced` | 任一版本清单仍引用资源，保留全部相关前缀 |
| `retained_version_prefix` | 版本存在但清单为空/损坏，仍保留整组资源 |
| `in_progress` | 输入中有未过期、有依据的上传租约；当前上传器无法直接提供 |
| `possible_upload` | 同组任一资源在宽限期内写入，整组保留，默认宽限 24 小时 |
| `unreferenced_observed` | 老资源暂时没有引用，等待下一次完整观察 |
| `suspected_orphan` | 两次完整观察间隔至少宽限期，整组对象指纹不变且均未被引用；仍不删除 |
| `reference_disappeared` | 前次仍有版本引用，现在消失，需要人工复核 |
| `unknown` | 清单采集不完整、租约读取失败、时间/长度缺失、未来时间或重复对象，保留 |

宽限期可增大，不能小于 24 小时。默认无租约证据时会注明上传状态不权威。保留所有旧版本，并不等于所有旧版本都可公开访问；公开访问权限仍遵循原有版本指针规则。已有版本前缀内的额外对象、跨前缀错误绑定、缺失对象、长度不符和损坏清单都会给出异常证据。对账没有读取内容，因此不能证明解密、内容哈希或 Godot 运行正常。

## 部署检查的范围

`ops:check-deployment` 只读取当前进程已注入的白名单配置，不自动加载 `.env`，不连接数据库、Redis、S3、DNS 或邮件服务。输出仅含字段名、静态要求和 PASS/MISSING/INVALID/WARNING；不打印配置值、邮箱、连接串、密钥或它们的哈希。若部署配置目前只在 `.env`，应由部署方通过现有安全注入机制提供；本次不会打开该文件检查。

检查主站/隔离游戏域名 HTTPS 与不同源、三种独立且足够长的密钥、作者邮箱格式、PostgreSQL/Redis URL、S3 端点/桶/区域/凭据和可选 path-style。当前已安装的 `undici` 要求 Node >=22.19.0；完整路由 mock 回归使用 Node 24。邮件配置缺失会提示注册验证条件，但不阻塞已有已验证作者账号的核心流程。格式检查不能判断凭据有效性、DNS 可用性、密码强度或权限正确性。

## 真实 Godot 测试的最小输入

1. 用户首个实际工程的完整 **Web 导出 ZIP**，入口名 `index.html`，保留配套 JS/WASM/PCK 及所需文件名。当前上传策略：ZIP ≤32 MiB，≤128 个条目，单文件 ≤64 MiB，总解压 ≤128 MiB；另有压缩比与路径限制。
2. 精确 Godot 版本、导出语言和预设说明。当前切片要求 Godot 4 Compatibility、单线程，关闭线程支持、扩展和 PWA；Godot 4 C# 当前不支持 Web。可参考 [Godot 官方 Web 导出说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)。
3. 3–5 条可判断成败的操作步骤，例如进入主场景、完成一次操作、重新开始；说明键鼠/触屏、音频、全屏和本地存档的预期。需要联网、麦克风或 Worker 的工程须先评估当前 CSP/权限限制。
4. 若要求修复导出或调试工程，再提供 `project.godot`、场景/脚本/资源和不含密码的导出预设。仅测试上传/预览并不强制交出工程源码。不要提供导出凭据、签名口令或 `.env`。

MoonKiller 上只检查了 PATH 的 `godot`/`godot4` 和常见 Godot 安装目录及下载目录的直接文件名，未发现可用 Godot。没有全盘搜索、下载或安装。真实引擎、用户工程的音频/输入/存档兼容性仍未验证；元数据 mock 和既有 Engine 替身不能替代真实工程。

## 上线前验收清单

- [ ] 由部署方安全注入配置，运行静态检查，处理缺项与警告。
- [ ] 隔离测试 PostgreSQL 上执行并验证迁移、作者权限、预览事务锁、版本号并发分配和公开指针切换。
- [ ] 隔离测试桶验证上传、下载、解密、超时、失败清理和最小权限；导出完整元数据生成至少两次对账报告。
- [ ] 确认所有历史/草稿/归档版本都在快照中；进行中的资源保留；人工复核可疑孤立资源。本切片不删除任何对象。
- [ ] 验证 `g-*` DNS/TLS、反向代理 Host/协议、上传大小、bootstrap 日志脱敏、私有资源边界和浏览器 Cookie fallback。
- [ ] 用用户真实导出验收 v1 预览、v2 更新、发布/回滚、音频、输入、全屏、存档和目标设备。
- [ ] 备份数据库、密文和稳定加密密钥，演练恢复；确认存储保留策略后再决定上线。

本切片本地验收：20 项运维 mock 测试通过；既有 21 项纯逻辑测试和 25 项路由 mock 回归需一起执行。最终运行结果记入本次交付记录。

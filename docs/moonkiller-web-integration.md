# 雾钟镇网页版接入

固定公开试玩入口：`/play/moonkiller`，首页有“走进小镇”入口。

## 来源与发布范围

源工程为 `C:/Users/Administrator/Documents/Codex/2026-10-07/task-2/MoonKiller`，Web 导出为 `exports/web/index.html`。已核验 HTML、PCK 和 `scripts/first_night.gd`、`scripts/town_ui.gd` 的哈希与 `evidence/usability_20261009/review_results.json` 一致，包含 v7 后 10 月 9 日两处提示修复。未改写源工程、游戏逻辑或原有交付档案。

`game-exports/moonkiller/20261009-e28ec8c25661` 只保留运行文件与字体许可证（共八个文件），共 97,993,808 字节。逐文件大小与 SHA-256 固定在 `src/lib/moonkiller-export.json`。没有 QA HTML、`.import` 文件、Windows 导出、账户数据或配置秘密。该公开版本随现有 Web 应用发布，文件位于 public 目录之外；Next.js 输出追踪明确包含这些文件。

## 内容隔离

`/moonkiller-assets/[version]/[filename]` 只接受固定版本与文件白名单，检查主站来源和文件大小，然后从本地部署目录流式返回资源。没有用户提供的远端 URL，也不从 S3 代理资源。未知文件、旧版本和 QA 页面返回 404。

播放器 iframe 使用 `sandbox="allow-scripts allow-pointer-lock"`，不授予同源权限。HTML 响应另设 CSP sandbox，即使直接访问运行 HTML 也保持不透明 origin。CSP 仅允许读取本版本资源路径，禁止 worker、子 iframe、表单和对象。CORS 只在这些新公开静态文件上允许 `Origin: null`，不允许凭据；账户和私有游戏接口没有新增 CORS。实际引擎完成 `startGame()` 后才显示“游戏已启动”，消息须来自当前 iframe、origin 为 null、版本标识正确。

没有配置 GAME_RUNTIME_URL 或 GAME_BUILD_ENCRYPTION_SECRET，没有改动通用 Godot 上传与私有预览权限，没有修改数据库、旧作品、存储权限、密钥或生产套餐。原 S3 公共地址与已知可用 COS 游戏地址不一致，未尝试上传或调整凭据；固定公开导出因此随现有应用打包。

## 验证与限制

类型检查和隔离 webpack 生产构建通过，包含资源输出追踪。108 项现有与新增测试通过；新增测试验证版本/文件边界、沙箱与 CSP、八个文件的原始哈希。真实原始 Godot 导出在本地浏览器中启动，通过普通点击、方向键移动、Esc 暂停与继续、全屏；没有游戏状态注入。本地平台账号与数据库使用明确的模拟数据。生产实测结果与精确提交、部署 ID 保存在本机 `.release-preflight/evidence`。

首次下载约 98MB；推荐电脑键盘游玩。刷新或重新加载会重开本局，当前沙箱不提供持久存档。Godot 引擎会记录已捕获的 Service Worker 禁用提示，游戏已启动；不为消除该提示放宽沙箱。默认静音。此次接入只验证启动与基本交互，没有重新完成双结局全流程，也不宣称触屏或全部浏览器均已验证。

回退应用到此前 `dbe97a3d619c8c3c3c85d77b51e95724e432533f` 会移除此固定试玩入口，不需数据库或存储回退。普通浏览和试玩使用现有 Web 服务的流量，不新增收费服务。

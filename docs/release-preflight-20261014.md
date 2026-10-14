# Duckmole 发布预检（2026-10-14）

本记录对应 MoonKiller 的 `E:\YaHaha`，仅允许 GitHub `7patrix/AI-Naive-Game-MVP` 和 Railway `courteous-illumination` 的 production 环境 / `duckmole.site`。没有操作 `awake-simplicity` / `healthtwins.site`。

## 源码比对与修正

本地与 GitHub main 的基线均为 `b02ef49840c0e98d51885ade8d407ae6b40da737`。远端 `railway/fix-deploy-ced763` 是历史分支，未用它覆盖本地源码。开始时已有 15 个已跟踪文件的未提交差异，包括两份文档删除；另外已有工作台、Godot、房间逻辑、测试及相关说明。原有修改全部保留。无关文档、技能目录和生成文件不纳入发布提交。

本次必要修正：

- 构建命令固定为 `next build --webpack`，与本机可重复通过的生产构建一致。默认 Turbopack 在 Windows 的隔离构建中发生 PostCSS 子进程错误；不能由此判断 Railway 的 Linux 构建也会失败。
- Node 运行时限定为 24.x，并同步 lockfile 的根包声明；实际验证使用 Node 24.17.0，满足 undici 的运行要求。依赖版本没有改动。
- 桌面截图发现不同简介长度造成同排卡片操作区域错位，改为卡片与内容伸展布局。
- 封面请求失败时显示原有占位插画和明确说明，保留卡片尺寸。
- 手机字段最小字号设为 16px；减少动画偏好下页面进入和加载指示保持静止。
- 手机详情侧栏改为撑满列宽，避免从网格切换为 flex 后继承 `align-items: start` 而缩成内容宽度。
- 封面首次请求在 React 接管前失败时，挂载检查补偿错过的错误事件；浏览器 404 验证通过。
- 账号表单补充语义名称和自动填写用途，保留原有登录、注册和找回密码操作。
- 增加页面加载反馈及可重试的错误页面；错误内容不展示服务器异常信息。
- 详情页读取远端说明设置 10 秒超时；公开信息保留设备和操作提示，去除面向实现的输入协议编号。
- 增加只复制明确源码的快照脚本，排除 `.env`，预检副本和截图在 `.release-preflight/` 中并被 Git 忽略。

## 已执行的验证

- `npm run typecheck` 通过。
- 102 项自动测试通过：Godot 安全纯函数 26、真实路由代码与模拟依赖 25、离线运维 20、房间/服务模拟 26、平台适配模拟 5。
- Prisma schema 校验通过；没有连接数据库或执行迁移。
- 最终源码在同盘、无 `.env` 的隔离副本以 Next 16.2.9 完成 webpack 生产构建。服务环境已清空，仅注入虚构配置，使用环境文件读取阻断器。
- 使用临时安装的 Playwright 和现有 Chromium 实际渲染本地 UI。UI 直接从仓库源码复制，仅在隔离副本替换账户/数据库依赖并添加模拟状态页。截图中的作品名称明确标为 UI 模拟数据。它不代表生产登录、存储或真实 Godot 验收。

浏览器证据和逐项结果保存在 `.release-preflight/evidence/`。开发预览中的 Next 开发指示器不属于正式产品界面；开发时延不能作为生产性能数据。模拟状态页没有进入正式源码。

浏览器回归已完成：24 项检查全部通过，没有浏览器未捕获异常。涵盖桌面卡片对齐、320/390/768px 无横向溢出、字段字号、跳转链接与主内容焦点、手机菜单与 Esc 焦点恢复、详情侧栏和举报标签、空状态、配置缺失时禁用上传、封面 404、发布确认、模拟服务错误重试、超限上传拒绝及页面错误恢复。先前跳转链接断言在绘制前读到过渡起始位置，补充等待两次 requestAnimationFrame 后验证顶部为 12px；未为该误报改动导航行为。

独立 PostgreSQL 18.6 / PGlite 0.5.9 引擎使用合成数据执行十个基线迁移和新增迁移通过。验证旧作品默认 HTML、单人模式、旧版本 PUBLISHED，旧查询兼容，模拟中途 SQL 冲突会原子回滚。新增未应用迁移加入 BEGIN/COMMIT。此检查不是生产数据恢复；完整恢复等待明确的数据导出授权。

## 生产阻塞与发布顺序

Railway 官方 CLI v5.68.0 已恢复到：

```text
C:\Users\Administrator\AppData\Local\Temp\duckmole-railway-v5.68.0\railway.exe
```

官方 Windows MSVC 发布 ZIP 的 SHA-256：`55026a7eeb34267b138b952160e310e41a3c4b8ded907e36e2eadaf2769b6e0a`，下载后已核对。用户完成官方登录后，正式网络权限路径的 `whoami` 与指定项目 `status` 均通过。没有直接读取或输出凭据、浏览器资料、Cookie 或 `.env`；未创建 Token 或新增 Railway 持久授权。默认沙盒 DNS 限制与间歇性 TLS EOF 不能误报成 Unauthorized；网络命令使用正规工具审批和当前系统已有代理，不修改 DNS/VPN/系统代理配置。

Railway 已确认 Web/Worker 当前实际部署 SHA 均为 `b02ef49840c0e98d51885ade8d407ae6b40da737`；两者 repo trigger 都监听目标仓库 main，checkSuites=false，watchPatterns=[]。当前旧部署均 canRollback/canRedeploy=true。公开 `/api/health` 在 2026-10-14 06:41:11 UTC 返回数据库与 Redis 均 ok（102ms）。

| 发布前必须核实的条件 | 当前结果 |
| --- | --- |
| 当前 Web/Worker 部署 SHA、自动部署分支、构建/启动/预部署命令 | 已核实：main 自动部署；Web buildCommand=null（RAILPACK），start=`npm run start`；Worker build=`npm run build`，start=`npm run worker`；均无 preDeployCommand |
| Postgres 已应用迁移列表与 schema drift | PostgreSQL 18.6；迁移前历史十个迁移已完成，新增字段和预览表不存在；14 账户、9 作品、9 版本、0 用户 API 凭据。完成备份/恢复验证后，生产 Prisma migrate deploy 退出 0，Godot 迁移应用成功 |
| 数据库可用备份、备份时间、恢复到隔离库的验证 | 平台备份过期且无自动计划。用户明确批准后，08:57:52–08:58:44 UTC 完成全部 18 张表的一致只读 AES-256-GCM 逻辑备份，约 1.3MB；密钥仅本机用户目录，备份不进 Git。完整内存 PostgreSQL 18.6 恢复验证通过，schema 与全部数据一致，29 外键有效，迁移后 14/9/9 保留 |
| 对象存储及既有密钥的可恢复性 | 未核实 |
| 既有 `API_KEY_ENCRYPTION_SECRET` 在 Web/Worker 一致且保持原值 | 已核实，两者均存在、足够长且相同；AUTH 与 S3 密钥也一致。比较只输出布尔结果，未保存/显示值或指纹，未修改任何配置 |
| 新增资源来源、每游戏子域的 DNS/TLS、精确 Host/协议路由 | GAME_RUNTIME_URL / GAME_BUILD_ENCRYPTION_SECRET 未配置，Godot 上传/预览继续安全禁用；本次没有配置新来源或生成构建密钥 |
| 当前生产登录、旧作品数据、HTML 游戏、队列/Worker | 未核实 |
| 真实 Godot 包的上传、预览、v2 发布、回退、音频/输入/存档 | 未核实；没有真实包 |

授权完成后，先用显式 project/environment/service ID 做只读核实，记录当前成功部署作为真实回退点，确认备份与恢复。再在隔离数据库验证所有待迁移 SQL；确认生产已应用历史迁移后，执行受控的 `prisma migrate deploy`。`build` / `start` 不会自动执行 `db:deploy`。

新增 `20261006000100_godot_builds` 迁移只添加枚举、字段、索引和预览表，旧作品默认为 `HTML`，旧版本默认为 `PUBLISHED`。它没有 DROP、TRUNCATE 或数据删除；真实表规模、锁等待和历史迁移状态仍需检查。新代码在多处查询新增字段，仅代码上线而没有迁移会造成错误。不得运行 `migrate reset`、`db push --accept-data-loss` 或生产 `db:seed` 来替代迁移。

核实自动部署影响后才推送经过测试的精确提交，分别检查 Web 与 Worker 的构建、迁移和运行结果。随后核实公开 `/api/health` 的数据库/Redis 状态、登录与旧数据、作品详情与实际游戏、任务消费、Godot 权限与发布回退。首页 HTTP 200、服务 Online、模拟测试均不能替代这些验收。

## 精确目标与回退参考

| 项目 | 标识 |
| --- | --- |
| Project | `c27baa02-9f99-4138-b6a6-672cacd88ced` |
| production environment | `e3875945-f2cf-4938-9ab0-a17fda375fd7` |
| Web service | `88dd0752-70a5-4b73-a7a9-44bb07f137ed` |
| Worker service | `3b3b819b-0a49-4a05-8a3d-5aa77b20ab49` |
| 旧 main 成功 Web deployment | `d48635ec-0a2e-421f-862a-34e8e89e3bbf` |
| 旧 main 成功 Worker deployment | `9b673209-d5a6-4918-93df-0d6de96a1a31` |

以上旧部署已在 Railway 确认仍为当前活动部署，且 canRollback/canRedeploy=true。迁移为追加型，正常代码回退应保留新增数据库结构；不执行破坏性的逆向迁移。恢复备份只在明确数据恢复需要时按已验证方案操作。生产追加迁移已完成，代码推送与部署随后执行。

Docker Desktop 与现有辅助服务已尝试启动，但 Linux 引擎响应超过 20 秒，未启用 WSL/更改系统设置，也没有操作既有容器。Railway SSH 缺少已注册公钥，未新增公钥。迁移与恢复测试使用同版本的独立 PostgreSQL WASM 引擎，项目依赖未改变。备份与恢复脚本、加密文件及恢复密钥不会进入 Git。初次完整导出被自动审批拒绝，用户明确同意后仅重试一次，获准并完成。审计时间的 JSON 时区表示有差别，比较规范为 UTC 且保留精确微秒；没有忽略数据值差异。

参考：[Railway CLI](https://docs.railway.com/cli)、[Railway 预部署命令](https://docs.railway.com/deployments/pre-deploy-command)。

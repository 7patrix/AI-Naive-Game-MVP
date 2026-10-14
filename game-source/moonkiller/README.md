# MoonKiller · 雾钟镇：第一夜

Godot 4.7.2 标准版 GDScript 原创 2.5D 可玩切片，使用 Compatibility 渲染。当前 v7 在 v6 的三位居民、两个可进出的室内、灯油选择与两结局上，完善对话键盘操作和灯油确认。保留 v3 实体建筑、v4 四向逐帧角色与 v5 提示/脚步/遮挡体验改进。

运行 `Start-MoonKiller.ps1`，或双击 `exports/windows/MoonKiller.exe`（保留同目录 `.pck`）。`Open-Editor.ps1` 打开工程；编辑器直接打开 `project.godot` 后 F5 也可运行。

- WASD / 方向键走动，Shift 加快。
- E 读便条、交谈、进出门、取绳；对话中 ↑↓ / Tab 选择，Enter 执行，E/Esc 关闭，PgUp/PgDn 滚动。鼠标也可点击选项。
- ESC 暂停或关闭对话；暂停菜单可调低音量和重新开始。
- R 在室外回到入口，在室内返回门口；保留本局剧情进度。
- 默认静音；右下角可以开启低音量。English / 中文切换会更新剧情与 HUD。

井边便条提供目标。将三封信交给旅店阿槐、药剂铺闻弦和钟楼前老柯。取药并交给阿槐，从井边取蜡绳给老柯修钟。准备完成后，在钟楼选择灯油照亮哪条路；入夜后到所选路线的居民处收取回信。结局可以继续探索或重新开始。

两份油只能维持一条路到清晨。选择路线后还要明确确认，两个页面默认焦点都在取消/返回；最终确认才消耗油。旅店巷亮起时，门打开，阿槐与闻弦在门前；钟楼路亮起时，钟楼更亮，闻弦移到老柯旁，阿槐留在锁门旅店里。随身提灯有独立油芯。

空间地面、固定斜俯视正交镜头与实体建筑共享真实深度和碰撞。人物/小道具是带深度测试的手绘 Y billboard。两个室内是独立物理房间，使用原创后墙绘、材质地面、侧墙和家具碰撞；门口淡入淡出是真正的场景位置切换。

本地 Web 预览运行 `Preview-Web.ps1`，访问 http://127.0.0.1:8765/index.html 。仅绑定回环地址。Web 为单线程 WebGL 2.0，使用键盘；需 HTTP 服务，不能直接双击 HTML。资源包约 58 MB，WASM 约 40 MB。无联网玩法或跨会话存档。

`Verify-MoonKiller.ps1` 运行对话输入、第一夜、v5 体验、v4 动画、旧切片及重载回归。当前小修见 `V7_DIALOG.md` 和 `evidence/dialog_v7/`。v6 原始实机证据保留在 `V6_FIRST_NIGHT.md` / `evidence/first_night_v6/`；独立回退包在工程上一级 `backups/`。

全部画面素材由本项目使用内置 imagegen 原创生成，后续只有确定性裁切、等比例缩放和脚底对齐。字体为官方 Noto Sans CJK SC / SIL OFL；音效为程序合成。来源与生成记录见 `ART_PROVENANCE.md`、`assets/art/first_night/*prompt.txt`。

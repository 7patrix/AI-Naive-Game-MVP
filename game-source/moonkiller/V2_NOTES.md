# 小完善：中文 HUD 与窄窗口

首版回退：工作区 `backups/MoonKiller-v1-complete.zip` 保存首版工程和 Windows / Web 导出；`backups/MoonKiller-v1-source.zip` 保存首版源码。`evidence/v1_before.png` 保留首版实机画面。

本版默认中文：镇名、任务、靠近提示、公告、钥匙与旅店反馈、暂停和声音入口；右上角 `English` 可随时在街道上切回英文，再点 `中文` 返回。界面切换保留任务进度。

实际键位未变：WASD / 方向键移动，Shift 加快，E 互动，ESC 暂停或关闭公告，R 回到抵达点且保留进度。底部和暂停菜单均明确显示。

合法嵌入 Noto Sans CJK SC Regular（官方 Noto 仓库，SIL OFL 1.1），中文与按钮字体随原生和 Web 打包，字形覆盖检查涵盖全部翻译文本。许可见 `assets/fonts/OFL.txt`，导出目录也附许可。

体验修复：公告打开时立即停步；忽略按键自动重复，避免长按 E 反复开关公告；720×600 窄窗口中操作说明与按钮分行。场景、美术与玩法范围保持首版街角切片。

验证证据：`v2_qa.log`、`v2_note_720x600.png`、`v2_pause_720x600.png`、`v2_after.png`、`v2_web_validation.txt`。本版继续验证原生与 Web 的移动、碰撞、任务前置、公告 → 井 → 旅店互动链、暂停及声音。

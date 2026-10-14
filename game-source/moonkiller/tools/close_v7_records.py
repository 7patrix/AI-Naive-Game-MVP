"""Reconcile verified v7 evidence before immutable checkpoint packaging."""
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
import json
import re

root = Path(__file__).resolve().parents[1]
evidence = root / "evidence/dialog_v7"
load = lambda name: json.loads((evidence / name).read_text(encoding="utf-8-sig"))

for name, count in [("native_results.json", 66), ("first_night_results.json", 113)]:
    results = load(name)["results"]
    assert len(results) == count and not any(r.startswith("FAIL") for r in results), name

for name, count, marker in [("web_full_story_logs.json", 111, "FIRST_NIGHT_QA_COMPLETE"), ("web_dialog_final_logs.json", 66, "DIALOG_QA_COMPLETE")]:
    record = load(name)
    assert re.search(rf"{marker} (?:results|checks)={count} failures=0", record["result"]["text"]), name
    assert not any(e["method"] == "Runtime.exceptionThrown" or "SCRIPT ERROR" in e["text"] or "FAIL " in e["text"] for e in record["events"]), name

preview = load("normal_web_preview_logs.json")
assert preview["state"]["url"] == "http://127.0.0.1:8765/index.html"
assert preview["state"]["canvas"] == [1280, 800] and preview["state"]["status"] == "removed"
assert any("MOTHWAKE_READY" in e["text"] for e in preview["events"])
assert '"args":[]' in (root / "exports/web/index.html").read_text(encoding="utf-8")
assert "MOTHWAKE_READY" in (evidence / "standalone_final.log").read_text(encoding="utf-8")
assert "MOTHWAKE_READY" in (evidence / "normal_preview.log").read_text(encoding="utf-8")

v6_expected = {
    "MoonKiller-v6-source.zip": "2d5c8e87ce4ba815b99bb93ffc5f6fd6ea7d130380638aaaf036d34bc50e4133",
    "MoonKiller-v6-checkpoint.zip": "9297ee99cd69568fd55aa6b3f8358b0e3bffa75e894ead8fe858adff0e2c64e8",
}
v6_actual = {}
for name, expected in v6_expected.items():
    digest = sha256()
    with (root.parent / "backups" / name).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    assert actual == expected, name
    v6_actual[name] = actual

summary = load("validation_summary.json")
for field in ["remaining", "blocker", "v7_archive_created"]:
    summary.pop(field, None)
summary.update({
    "validated_at_utc": datetime.now(timezone.utc).isoformat(),
    "validation_complete": True,
    "web_dialog_checks": 66,
    "web_dialog_failures": 0,
    "web_full_first_night_checks": 111,
    "web_full_first_night_failures": 0,
    "web_final_proof": "web_dialog_final_logs.json and web_full_story_logs.json contain complete final browser-console records",
    "web_method": "Isolated installed Chrome against the actual Web export on loopback HTTP; no game-code injection",
    "browser_keyboard_visual_checks": {
        "normal_entry": True,
        "ordinary_walk_to_noticeboard": True,
        "held_E_and_browser_autorepeat_keep_dialog_open": True,
        "released_fresh_E_closes": True,
        "Tab_focus_and_Enter_close": True,
        "Escape_pause_resume": True,
        "720x540_focus_hint_and_panel_visible": True,
        "proof": "web_browser_keyboard_trace.json and web_browser_*.png, visually inspected",
    },
    "standalone_startup": {"latest_export_exit_code": 0, "log": "standalone_final.log"},
    "normal_preview": {
        "url": "http://127.0.0.1:8765/index.html",
        "qa_arguments": [],
        "canvas": [1280, 800],
        "screenshot": "web_preview_v7.png",
        "native_ready_log": "normal_preview.log",
        "visible_windows": "Both native and dedicated Web windows were launched; no longer running at the later process check. Local HTTP entry remains available.",
    },
    "console_notes": "No Godot script errors or JavaScript exceptions in completed regression runs. First story run recorded a non-game favicon.ico 404.",
    "v6_baseline": {"unchanged_hashes_verified": True, "sha256": v6_actual},
    "archive_status_source": "../../../backups/v7_manifest.json (external CRC/SHA authority, written by package_checkpoint.py)",
    "prior_interruption": "Retained web_observed_receipt.json and web_attempt1_logs.json as historical evidence; remaining validation resumed successfully.",
})
(evidence / "validation_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

notes_path = root / "V7_DIALOG.md"
notes = notes_path.read_text(encoding="utf-8").rstrip()
notes = notes.rsplit("\n\n", 1)[0]
notes += "\n\n收尾已恢复并完成：Web 全剧情 111 项、对话输入 66 项均通过，完整控制台记录已保存。正常 Web 入口使用空 QA 参数，1280×800 截图已核验；浏览器真实按键走到公告牌，核验按住 E/重复输入、松开后关闭、Tab 焦点、Enter、Esc 暂停恢复和 720×540 显示。最新 Windows 导出包启动退出码 0，正常原生窗口也输出就绪日志。可见窗口启动后已关闭，本地 HTTP 试玩入口仍可用。\n\n原生通过结果继续复用：对话 66、全剧情 113、体验 16、动画 36、基础玩法 29、重载 5。自动化快路径与 UI 状态夹具不代表真人游玩时长；没有为时长添加等待或对白。v6 两个回退包的 SHA-256 已重新核对一致。v7 源码/完整包的最终 CRC/SHA 以工作区 `backups/v7_manifest.json` 为准；历史中断记录保留。\n"
notes_path.write_text(notes, encoding="utf-8")
print(json.dumps({"validation_complete": True, "web_story": 111, "web_dialog": 66, "v6_hashes_unchanged": True}))

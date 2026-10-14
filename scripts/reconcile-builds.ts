import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { reconcileBuilds } from "../src/lib/game-build-reconciliation";
const usage = "Read-only build reconciliation: --snapshot <metadata.json> [--previous <report.json>] [--output <new-report.json>] [--grace-hours 24]. Offline snapshots only. No --apply, --delete or --live exists.";
function readJson(path: string) {
    if (/^\.env/i.test(basename(path)) || statSync(path).size > 32 * 1024 * 1024)
        throw new Error("Input is not allowed.");
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help")
    console.log(usage);
else {
    try {
        const options: Record<string, string> = {};
        for (let i = 0; i < args.length; i += 2) {
            const name = args[i];
            if (!["--snapshot", "--previous", "--output", "--grace-hours"].includes(name) || options[name] !== undefined || !args[i + 1] || args[i + 1].startsWith("--"))
                throw new Error("Invalid option.");
            options[name] = args[i + 1];
        }
        if (!options["--snapshot"])
            throw new Error("A snapshot is required.");
        const report = reconcileBuilds(readJson(options["--snapshot"]), options["--previous"] ? readJson(options["--previous"]) : undefined, { graceHours: options["--grace-hours"] ? Number(options["--grace-hours"]) : undefined });
        const json = JSON.stringify(report, null, 2) + "\n";
        if (options["--output"]) {
            if (/^\.env/i.test(basename(options["--output"])))
                throw new Error("Output is not allowed.");
            writeFileSync(options["--output"], json, { encoding: "utf8", flag: "wx" });
            console.log("只读报告已保存；没有连接服务或执行删除。");
        }
        else
            console.log(json);
    }
    catch {
        console.error("未生成报告：请检查参数、快照格式/完整性、32MiB 输入限制和输出文件是否已存在。不会显示输入内容或执行任何存储操作。");
        console.error(usage);
        process.exitCode = 2;
    }
}

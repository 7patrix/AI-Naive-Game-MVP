import { checkDeploymentConfiguration, deploymentConfigurationFields } from "../src/lib/deployment-readiness";
const args = process.argv.slice(2);
if (args.includes("--help")) {
    console.log("Offline configuration check: --json optionally prints a machine-readable report. Reads process environment only; never loads .env or connects to services. Exit 2 means missing/invalid configuration; exit 0 does not confirm deployment readiness.");
}
else if (args.some(arg => arg !== "--json")) {
    console.error("Unsupported option. Only --json or --help is accepted; no service access or secret output is available.");
    process.exitCode = 2;
}
else {
    const values = Object.fromEntries(deploymentConfigurationFields.map(field => [field, process.env[field]]));
    const report = checkDeploymentConfiguration(values, process.versions.node);
    if (args.includes("--json"))
        console.log(JSON.stringify(report, null, 2));
    else {
        console.log(report.configurationComplete ? "配置静态检查通过；部署就绪尚未验证。" : "配置不齐备；没有连接任何服务。");
        for (const check of report.checks)
            console.log(`${check.status} ${check.field}: ${check.requirement}`);
        console.log("仍需验证：");
        for (const item of report.manualChecks)
            console.log(`- ${item}`);
    }
    if (!report.configurationComplete)
        process.exitCode = 2;
}

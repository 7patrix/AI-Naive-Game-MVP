import { checkBuildEncryption, gameRuntimeOrigin, runtimeOrigin } from "./game-build-security";
export type ConfigurationCheck = {
    field: string;
    status: "PASS" | "MISSING" | "INVALID" | "WARNING";
    requirement: string;
};
export function checkDeploymentConfiguration(values: Record<string, string | undefined>, nodeVersion: string) {
    const checks: ConfigurationCheck[] = [];
    const check = (field: string, requirement: string, valid: (value: string) => boolean) => {
        const value = values[field];
        let status: ConfigurationCheck["status"] = !value?.trim() ? "MISSING" : "PASS";
        if (status === "PASS") {
            try {
                if (!valid(value!))
                    status = "INVALID";
            }
            catch {
                status = "INVALID";
            }
        }
        checks.push({ field, status, requirement });
    };
    const url = (protocols: string[], root = false) => (value: string) => { const parsed = new URL(value); return protocols.includes(parsed.protocol) && Boolean(parsed.hostname) && !parsed.username && !parsed.password && !parsed.hash && (!root || parsed.pathname === "/" && !parsed.search); };
    const serviceUrl = (protocols: string[]) => (value: string) => { const parsed = new URL(value); return protocols.includes(parsed.protocol) && Boolean(parsed.hostname); };
    const placeholder = (value: string) => /^(dev[-_]|fixture[-_]|mock[-_]|change.?me|replace|your[-_]|example|minioadmin)/i.test(value) || new Set(value).size < 6;
    const secret = (value: string) => value.length >= 32 && Buffer.byteLength(value) >= 32 && !placeholder(value);
    check("APP_URL", "显式配置主站 HTTPS 根地址，不含凭据、查询或片段", url(["https:"], true));
    check("GAME_RUNTIME_URL", "显式配置独立游戏来源的 HTTPS 根地址，支持每游戏子域", value => { runtimeOrigin(values.APP_URL ?? "", value, true); gameRuntimeOrigin(value, "00000000-0000-0000-0000-000000000000"); return url(["https:"], true)(value); });
    check("GAME_BUILD_ENCRYPTION_SECRET", "稳定独立的至少 32 字符构建密钥，不能为默认或测试占位值", value => { checkBuildEncryption(value); return secret(value); });
    check("AUTH_SECRET", "至少 32 字符且非默认或测试占位值", secret);
    check("API_KEY_ENCRYPTION_SECRET", "现有 API 管理在生产需要独立的至少 32 字符密钥", secret);
    check("ADMIN_EMAILS", "至少一个格式有效的作者管理员邮箱；不显示邮箱内容", value => value.split(",").every(email => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email.trim())));
    check("DATABASE_URL", "显式 PostgreSQL 连接串；不会连接或输出连接串", serviceUrl(["postgres:", "postgresql:"]));
    check("REDIS_URL", "现有生成 Worker 所需 Redis/rediss 连接串", serviceUrl(["redis:", "rediss:"]));
    check("S3_INTERNAL_ENDPOINT", "显式服务端 S3 地址；HTTP 仅应在受控内网使用", url(["http:", "https:"]));
    check("S3_ENDPOINT", "现有上传签名流程所需 S3 地址", url(["http:", "https:"]));
    check("S3_PUBLIC_BASE_URL", "既有 HTML 作品和公共素材所需 HTTPS 地址", url(["https:"]));
    check("S3_REGION", "显式配置非空区域标识", value => /^[A-Za-z0-9-]{1,64}$/.test(value));
    check("S3_BUCKET", "显式配置存储桶名称", value => /^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$/.test(value));
    check("S3_ACCESS_KEY_ID", "显式非默认/占位访问标识；不显示内容", value => !placeholder(value));
    check("S3_SECRET_ACCESS_KEY", "显式非默认/占位存储凭据；不显示内容", value => !placeholder(value));
    if (values.S3_FORCE_PATH_STYLE !== undefined)
        check("S3_FORCE_PATH_STYLE", "仅接受 true 或 false", value => value === "true" || value === "false");
    const secrets = [values.AUTH_SECRET, values.GAME_BUILD_ENCRYPTION_SECRET, values.API_KEY_ENCRYPTION_SECRET].filter((value): value is string => Boolean(value));
    checks.push({ field: "KEY_PURPOSE_SEPARATION", status: new Set(secrets).size === secrets.length ? "PASS" : "INVALID", requirement: "登录、构建和 API 凭据使用不同密钥" });
    const [major = 0, minor = 0] = nodeVersion.split(".").map(Number);
    checks.push({ field: "NODE_RUNTIME", status: Number.isFinite(major) && Number.isFinite(minor) && (major > 22 || major === 22 && minor >= 19) ? "PASS" : "INVALID", requirement: "当前 undici 要求 Node >=22.19.0；完整 mock 回归使用 Node 24" });
    if (!values.RESEND_API_KEY || !values.EMAIL_FROM)
        checks.push({ field: "EMAIL_REGISTRATION", status: "WARNING", requirement: "新账号邮件验证需配置 RESEND_API_KEY 和 EMAIL_FROM，或确认采用已有验证账号/其他登录流程" });
    const missing = checks.filter(row => row.status === "MISSING").map(row => row.field), invalid = checks.filter(row => row.status === "INVALID").map(row => row.field);
    return { reportKind: "OFFLINE_CONFIGURATION_CHECK" as const, configurationComplete: missing.length === 0 && invalid.length === 0, readyForDeployment: false as const, missing, invalid, checks, manualChecks: ["实际数据库迁移、连接与作者账号权限", "S3 List/Get/Put/Delete 权限及故障恢复；现有版本全量快照", "通配 DNS/TLS、精确 Host/协议路由和 HTTPS 浏览器预览", "bootstrap 日志脱敏、稳定密钥备份与恢复演练", "真实 Godot 工程的浏览器、音频、触控与存档验收", "S3/Redis/数据库的内网隔离或 TLS 策略"] };
}
export const deploymentConfigurationFields = ["APP_URL", "GAME_RUNTIME_URL", "GAME_BUILD_ENCRYPTION_SECRET", "AUTH_SECRET", "API_KEY_ENCRYPTION_SECRET", "ADMIN_EMAILS", "DATABASE_URL", "REDIS_URL", "S3_INTERNAL_ENDPOINT", "S3_ENDPOINT", "S3_PUBLIC_BASE_URL", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE", "RESEND_API_KEY", "EMAIL_FROM"] as const;

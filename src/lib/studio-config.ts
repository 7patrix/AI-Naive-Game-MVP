import { env } from "./env";
import { checkBuildEncryption, gameRuntimeOrigin, runtimeOrigin } from "./game-build-security";
export function studioConfiguration() {
  try {
    const origin = runtimeOrigin(env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production");
    gameRuntimeOrigin(origin, "00000000-0000-0000-0000-000000000000");
    checkBuildEncryption(env.GAME_BUILD_ENCRYPTION_SECRET);
    return { origin, unavailable: undefined };
  } catch { return { origin: undefined, unavailable: "上传和预览尚未启用。维护者需要配置独立的游戏资源地址及构建加密密钥；现有作品不受影响。" }; }
}

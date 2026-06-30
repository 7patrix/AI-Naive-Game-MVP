import { createHash } from "node:crypto";
import { ApiCredentialSource, GameStatus, GenerationJobStatus, PrismaClient } from "@prisma/client";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { Worker as BullWorker } from "bullmq";
import type { RemoteGameManifest } from "../../src/lib/game-manifest";
import {
  completeJson,
  completeText,
  completeVisionText,
  consumeModelUsage,
  hasModelConfig,
  resetModelUsage,
  type ModelClientConfig
} from "../../src/lib/model-client";
import { decryptApiKey } from "../../src/lib/api-credential-crypto";
import {
  GENERATION_JOB_NAME,
  GENERATION_QUEUE_NAME,
  createBullMqConnectionOptions,
  type GenerationQueuePayload
} from "../../src/lib/queue";
import { uploadObject } from "../../src/lib/storage";

const prisma = new PrismaClient();

type Job = NonNullable<Awaited<ReturnType<typeof claimJob>>>;
type JobModelConfig = ModelClientConfig | null;
type GameSpec = {
  title: string;
  genre: string;
  coreLoop: string;
  promptSummary: string;
  description: string;
  tags: string[];
};
type InputAsset = {
  id?: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
};
type AssetAnalysis = {
  filename: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
  kind: "image" | "video" | "audio" | "text" | "document" | "other";
  summary: string;
  dimensions?: {
    width: number;
    height: number;
  };
  textPreview?: string;
  visionSummary?: string;
};
type BundlePlan = {
  entry: string;
  runtime: string;
  files: string[];
  generator: "llm" | "fallback";
  html?: string;
};
type CostEstimate = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  pricing: "api-usage-estimate" | "openai-compatible-estimate" | "fallback-local";
  usageSource: "api" | "estimated" | "fallback";
  modelCalls: number;
};
type PublishResult = Awaited<ReturnType<typeof runPublisherAgent>>;
type ReviewReport = {
  passed: boolean;
  reason: string;
  retryable: boolean;
  checks: {
    externalScripts: "passed" | "blocked";
    sandboxRequired: true;
    maxBundleFiles: number;
    allowedAssetUrls: string[];
    forbiddenFileUpload: "passed" | "blocked";
  };
};
type ArtifactRef = {
  type: string;
  version: number;
  artifactId: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function hashArtifactPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getJobModelConfig(job: Job): JobModelConfig {
  if (!job.apiCredential) {
    if (job.apiCredentialSource === ApiCredentialSource.USER_KEY) {
      throw new Error("你的自带 API 配置不存在或已被删除，请重新选择 API 配置后再创建任务。");
    }

    return null;
  }

  const wireApi = job.apiCredential.wireApi === "responses" ? "responses" : "chat";

  return {
    apiKey: decryptApiKey(job.apiCredential.encryptedApiKey),
    baseUrl: job.apiCredential.baseUrl,
    modelName: job.apiCredential.modelName,
    wireApi
  };
}

function shouldFailOnModelError(job: Job) {
  return job.apiCredentialSource === ApiCredentialSource.USER_KEY;
}

function buildUserKeyFailureMessage(message: string) {
  return `你的自带 API 配置调用失败，请在 API 管理中重新测试或更新配置。错误：${message}`;
}

async function writeArtifact(jobId: string, type: string, payload: unknown, storageKey?: string, publicUrl?: string) {
  const latest = await prisma.jobArtifact.findFirst({
    where: {
      jobId,
      type
    },
    orderBy: {
      version: "desc"
    },
    select: {
      version: true
    }
  });
  const version = (latest?.version ?? 0) + 1;
  const artifact = await prisma.jobArtifact.create({
    data: {
      jobId,
      type,
      version,
      payload: payload as object,
      storageKey,
      publicUrl,
      sha256: hashArtifactPayload({ payload, storageKey, publicUrl })
    }
  });

  return {
    type,
    version,
    artifactId: artifact.id
  };
}

function buildSearchText(spec: GameSpec) {
  return [spec.title, spec.description, spec.genre, spec.coreLoop, ...spec.tags].join(" ").toLowerCase();
}

function getInputAssets(job: Job): InputAsset[] {
  if (!Array.isArray(job.inputFiles)) {
    return [];
  }

  return job.inputFiles.filter((item): item is InputAsset => {
    if (!item || typeof item !== "object") return false;
    const asset = item as Partial<InputAsset>;
    return (
      typeof asset.filename === "string" &&
      typeof asset.contentType === "string" &&
      typeof asset.sizeBytes === "number" &&
      typeof asset.publicUrl === "string"
    );
  });
}

function getAssetKind(contentType: string): AssetAnalysis["kind"] {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("text/")) return "text";
  if (contentType.includes("json") || contentType.includes("xml")) return "text";
  if (contentType.includes("pdf") || contentType.includes("document")) return "document";
  return "other";
}

function parsePngDimensions(bytes: Uint8Array) {
  const isPng =
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  if (!isPng) {
    return null;
  }

  return {
    width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
    height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
  };
}

function parseGifDimensions(bytes: Uint8Array) {
  const isGif =
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46;

  if (!isGif) {
    return null;
  }

  return {
    width: bytes[6] | (bytes[7] << 8),
    height: bytes[8] | (bytes[9] << 8)
  };
}

function parseJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isStartOfFrame) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8]
      };
    }

    offset += 2 + length;
  }

  return null;
}

function parseImageDimensions(bytes: Uint8Array) {
  return parsePngDimensions(bytes) ?? parseGifDimensions(bytes) ?? parseJpegDimensions(bytes);
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function buildTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, "").slice(0, 18);
  return compact ? `AI 小游戏：${compact}` : "AI 生成小游戏";
}

function buildSlug(title: string, jobId: string) {
  const ascii = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `${ascii || "generated-game"}-${jobId.slice(-8)}`;
}

function buildFallbackSpec(prompt: string): GameSpec {
  const lowerPrompt = prompt.toLowerCase();
  const summary = prompt.slice(0, 180);

  if (/(收集|采集|金币|宝石|星星|collect|coin|gem|star)/i.test(lowerPrompt)) {
    return {
      title: buildTitle(prompt),
      genre: "Collector",
      coreLoop: "玩家移动角色收集发光宝石，同时避开红色危险球，尽可能获得高分。",
      promptSummary: summary,
      description: `根据创意“${prompt.slice(0, 80)}”生成的收集类 Web 小游戏。`,
      tags: ["AI生成", "Collector", "Canvas"]
    };
  }

  if (/(点击|反应|打地鼠|tap|click|reaction|whack)/i.test(lowerPrompt)) {
    return {
      title: buildTitle(prompt),
      genre: "Reaction",
      coreLoop: "玩家需要快速点击不断出现的目标，连续命中会获得更高分数。",
      promptSummary: summary,
      description: `根据创意“${prompt.slice(0, 80)}”生成的反应点击类 Web 小游戏。`,
      tags: ["AI生成", "Reaction", "Canvas"]
    };
  }

  if (/(追逐|迷宫|逃离|怪物|chase|maze|escape|monster)/i.test(lowerPrompt)) {
    return {
      title: buildTitle(prompt),
      genre: "Chase",
      coreLoop: "玩家在追逐压力下移动角色，保持距离并尽量存活更久。",
      promptSummary: summary,
      description: `根据创意“${prompt.slice(0, 80)}”生成的追逐生存类 Web 小游戏。`,
      tags: ["AI生成", "Chase", "Canvas"]
    };
  }

  return {
    title: buildTitle(prompt),
    genre: "Arcade",
    coreLoop: "玩家通过键盘或鼠标操作角色，躲避障碍并获得分数。",
    promptSummary: summary,
    description: `根据创意“${prompt.slice(0, 80)}”生成的轻量级 Web 小游戏。`,
    tags: ["AI生成", "Arcade", "Canvas"]
  };
}

function getRemixContext(job: Job) {
  if (!job.parentGame) {
    return "";
  }

  return `Remix 源游戏：${job.parentGame.title}。源游戏简介：${job.parentGame.description}。源版本：v${job.remixSourceVersion?.versionNumber ?? job.parentGame.currentVersionNumber}。`;
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function calculateEstimatedCostCents(inputTokens: number, outputTokens: number) {
  const estimatedDollars = (inputTokens / 1000) * 0.00015 + (outputTokens / 1000) * 0.0006;
  return Math.max(1, Math.ceil(estimatedDollars * 100));
}

function estimateGenerationCost(job: Job, spec: GameSpec, bundlePlan: BundlePlan, modelConfig: JobModelConfig): CostEstimate {
  const usage = consumeModelUsage();
  const estimatedInputTokens = estimateTokens(
    [job.prompt, getRemixContext(job), JSON.stringify(job.inputFiles ?? []), JSON.stringify(spec)].join("\n")
  );
  const estimatedOutputTokens = estimateTokens([JSON.stringify(spec), bundlePlan.html ?? ""].join("\n"));

  if (usage) {
    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostCents: calculateEstimatedCostCents(usage.inputTokens, usage.outputTokens),
      pricing: "api-usage-estimate",
      usageSource: "api",
      modelCalls: usage.calls
    };
  }

  if (!hasModelConfig(modelConfig) || bundlePlan.generator === "fallback") {
    return {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      estimatedCostCents: 0,
      pricing: "fallback-local",
      usageSource: "fallback",
      modelCalls: 0
    };
  }

  return {
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    estimatedCostCents: calculateEstimatedCostCents(estimatedInputTokens, estimatedOutputTokens),
    pricing: "openai-compatible-estimate",
    usageSource: "estimated",
    modelCalls: 0
  };
}

function generateGameHtml(spec: GameSpec, job: Job, assetAnalyses: AssetAnalysis[] = []) {
  const title = escapeHtml(spec.title);
  const prompt = jsonForScript(spec.promptSummary);
  const coreLoop = escapeHtml(spec.coreLoop);
  const fallbackMode = jsonForScript(spec.genre.toLowerCase());
  const primaryImageAsset = assetAnalyses.find((asset) => asset.kind === "image");
  const primaryImageUrl = jsonForScript(primaryImageAsset?.publicUrl ?? null);
  const primaryImageName = jsonForScript(primaryImageAsset?.filename ?? null);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #020617;
        color: #e2e8f0;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #game {
        display: block;
        width: 100vw;
        height: 100vh;
      }
      .hud {
        position: fixed;
        left: 20px;
        top: 20px;
        z-index: 2;
        max-width: 520px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.72);
        padding: 14px 16px;
        backdrop-filter: blur(12px);
      }
      .hud h1 {
        margin: 0 0 6px;
        font-size: 18px;
      }
      .hud p {
        margin: 0;
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.6;
      }
      .restart {
        position: fixed;
        left: 50%;
        top: calc(50% + 64px);
        z-index: 3;
        transform: translateX(-50%);
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 14px;
        background: #4f46e5;
        color: white;
        cursor: pointer;
        font: 700 16px system-ui;
        padding: 12px 22px;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.35);
      }
      .restart[hidden] {
        display: none;
      }
    </style>
  </head>
  <body>
    <canvas id="game" tabindex="0"></canvas>
    <div class="hud">
      <h1>${title}</h1>
      <p>${coreLoop}</p>
      <p>方向键 / WASD 移动，躲避陨石，存活越久分数越高。</p>
      ${primaryImageAsset ? `<p>玩家角色使用上传素材：${escapeHtml(primaryImageAsset.filename)}</p>` : ""}
    </div>
    <button class="restart" id="restart" hidden>重新开始</button>
    <script>
      const promptSummary = ${prompt};
      const gameMode = ${fallbackMode};
      const uploadedPlayerImageUrl = ${primaryImageUrl};
      const uploadedPlayerImageName = ${primaryImageName};
      const canvas = document.getElementById("game");
      const restartButton = document.getElementById("restart");
      const ctx = canvas.getContext("2d");
      const keys = new Set();
      const player = { x: 120, y: 120, r: 15, speed: 5 };
      const uploadedPlayerImage = new Image();
      let uploadedPlayerImageReady = false;
      if (uploadedPlayerImageUrl) {
        uploadedPlayerImage.onload = () => {
          uploadedPlayerImageReady = true;
        };
        uploadedPlayerImage.src = uploadedPlayerImageUrl;
      }
      function createMeteors() {
        return Array.from({ length: gameMode === "chase" ? 4 : 10 }, (_, index) => ({
          x: 260 + index * 90,
          y: 80 + (index % 5) * 90,
          r: gameMode === "collector" ? 10 + (index % 3) * 4 : 14 + (index % 4) * 5,
          vx: gameMode === "chase" ? 1.4 + Math.random() * 1.2 : -2.2 - Math.random() * 2.5,
          vy: gameMode === "chase" ? 1.2 + Math.random() * 1.2 : -1.4 + Math.random() * 2.8,
          kind: gameMode === "collector" && index % 3 !== 0 ? "gem" : "hazard"
        }));
      }
      let meteors = createMeteors();
      const target = { x: 420, y: 220, r: 32, ttl: 1600 };
      let score = 0;
      let alive = true;
      let last = performance.now();

      function resize() {
        canvas.width = window.innerWidth * devicePixelRatio;
        canvas.height = window.innerHeight * devicePixelRatio;
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function resetGame() {
        keys.clear();
        player.x = 120;
        player.y = 120;
        meteors = createMeteors();
        score = 0;
        alive = true;
        last = performance.now();
        target.x = 120 + Math.random() * Math.max(160, window.innerWidth - 240);
        target.y = 120 + Math.random() * Math.max(120, window.innerHeight - 240);
        target.ttl = 1600;
        restartButton.hidden = true;
        canvas.focus();
      }

      function moveTarget(width, height) {
        target.x = 80 + Math.random() * Math.max(120, width - 160);
        target.y = 80 + Math.random() * Math.max(120, height - 160);
        target.ttl = 1300 + Math.random() * 900;
      }

      function step(now) {
        const dt = Math.min(32, now - last);
        last = now;
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (alive && gameMode !== "reaction") {
          if (keys.has("ArrowLeft") || keys.has("a")) player.x -= player.speed;
          if (keys.has("ArrowRight") || keys.has("d")) player.x += player.speed;
          if (keys.has("ArrowUp") || keys.has("w")) player.y -= player.speed;
          if (keys.has("ArrowDown") || keys.has("s")) player.y += player.speed;
          player.x = clamp(player.x, player.r, width - player.r);
          player.y = clamp(player.y, player.r, height - player.r);
          score += gameMode === "collector" ? dt * 0.004 : dt * 0.015;
        }

        if (alive && gameMode === "reaction") {
          target.ttl -= dt;
          score += dt * 0.004;
          if (target.ttl <= 0) alive = false;
        }

        ctx.clearRect(0, 0, width, height);
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#0f172a");
        gradient.addColorStop(1, "#312e81");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 80; i++) {
          ctx.fillStyle = "rgba(226, 232, 240, " + (0.25 + (i % 5) * 0.12) + ")";
          ctx.fillRect((i * 97 + score * 8) % width, (i * 53) % height, 2, 2);
        }

        for (const meteor of meteors) {
          if (alive) {
            if (gameMode === "chase") {
              const angle = Math.atan2(player.y - meteor.y, player.x - meteor.x);
              meteor.x += Math.cos(angle) * meteor.vx;
              meteor.y += Math.sin(angle) * meteor.vy;
            } else if (gameMode !== "collector" || meteor.kind === "hazard") {
              meteor.x += meteor.vx;
              meteor.y += meteor.vy;
            }
            if (meteor.x < -40) meteor.x = width + 40;
            if (meteor.x > width + 40) meteor.x = -40;
            if (meteor.y < 40 || meteor.y > height - 40) meteor.vy *= -1;
            const dx = meteor.x - player.x;
            const dy = meteor.y - player.y;
            if (Math.hypot(dx, dy) < meteor.r + player.r) {
              if (gameMode === "collector" && meteor.kind === "gem") {
                score += 25;
                meteor.x = 80 + Math.random() * Math.max(120, width - 160);
                meteor.y = 80 + Math.random() * Math.max(120, height - 160);
              } else {
                alive = false;
              }
            }
          }

          ctx.beginPath();
          ctx.fillStyle = gameMode === "collector" && meteor.kind === "gem" ? "#facc15" : "#fb923c";
          ctx.arc(meteor.x, meteor.y, meteor.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(254, 215, 170, 0.8)";
          ctx.stroke();
        }

        if (alive && gameMode === "reaction") {
          ctx.beginPath();
          ctx.fillStyle = "#22c55e";
          ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(187, 247, 208, 0.95)";
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "bold 18px system-ui";
          ctx.fillText("Time: " + Math.ceil(target.ttl / 100) / 10, 24, height - 66);
        }

        ctx.save();
        ctx.translate(player.x, player.y);
        if (uploadedPlayerImageReady) {
          const size = player.r * 3.6;
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(uploadedPlayerImage, -size / 2, -size / 2, size, size);
          ctx.restore();
          ctx.strokeStyle = alive ? "#7dd3fc" : "#ef4444";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(125, 211, 252, 0.18)";
          ctx.beginPath();
          ctx.arc(0, 0, size / 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = alive ? "#38bdf8" : "#ef4444";
          ctx.beginPath();
          ctx.moveTo(0, -player.r - 8);
          ctx.lineTo(player.r + 8, player.r + 6);
          ctx.lineTo(0, player.r);
          ctx.lineTo(-player.r - 8, player.r + 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 22px system-ui";
        ctx.fillText("Score: " + Math.floor(score), 24, height - 34);
        if (!alive) {
          ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.font = "bold 36px system-ui";
          ctx.fillText("游戏结束", width / 2, height / 2 - 20);
          ctx.font = "18px system-ui";
          ctx.fillText("点击重新开始，或按 R 键再玩一次。创意来源：" + promptSummary, width / 2, height / 2 + 22);
          ctx.textAlign = "left";
          restartButton.hidden = false;
        }

        requestAnimationFrame(step);
      }

      window.addEventListener("resize", resize);
      window.addEventListener("keydown", (event) => {
        if (!alive && event.key.toLowerCase() === "r") {
          resetGame();
          return;
        }
        keys.add(event.key);
      });
      window.addEventListener("keyup", (event) => keys.delete(event.key));
      window.addEventListener("pointerdown", (event) => {
        if (!alive || gameMode !== "reaction") return;
        const dx = event.clientX - target.x;
        const dy = event.clientY - target.y;
        if (Math.hypot(dx, dy) <= target.r + 8) {
          score += 50;
          moveTarget(window.innerWidth, window.innerHeight);
        }
      });
      window.addEventListener("message", (event) => {
        if (!event.data || event.data.type !== "AI_ARCADE_KEY") return;
        const key = event.data.key;
        if (typeof key !== "string") return;
        if (!alive && event.data.phase === "keydown" && key.toLowerCase() === "r") {
          resetGame();
          return;
        }
        if (event.data.phase === "keydown") keys.add(key);
        if (event.data.phase === "keyup") keys.delete(key);
      });
      restartButton.addEventListener("click", resetGame);
      resize();
      requestAnimationFrame(step);
    </script>
  </body>
</html>
<!-- generated by job ${job.id} -->`;
}

function generateCoverSvg(spec: GameSpec) {
  const title = escapeHtml(spec.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#312e81"/>
      <stop offset="55%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#f97316"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#g)"/>
  <circle cx="980" cy="130" r="88" fill="rgba(255,255,255,0.18)"/>
  <circle cx="180" cy="520" r="130" fill="rgba(255,255,255,0.12)"/>
  <text x="80" y="330" fill="white" font-family="Arial, sans-serif" font-size="64" font-weight="700">${title}</text>
  <text x="82" y="390" fill="rgba(255,255,255,0.82)" font-family="Arial, sans-serif" font-size="28">AI 生成互动小游戏</text>
</svg>`;
}

async function claimJob(jobId: string) {
  const claimed = await prisma.generationJob.updateMany({
    where: {
      id: jobId,
      status: GenerationJobStatus.PENDING
    },
    data: {
      status: GenerationJobStatus.RUNNING,
      progress: 10,
      startedAt: new Date()
    }
  });

  if (claimed.count === 0) {
    return null;
  }

  await prisma.agentLog.create({
    data: {
      jobId,
      agentName: "Worker",
      step: "job_started",
      message: "BullMQ Worker 已领取任务，开始执行 Agent 流水线。"
    }
  });

  return prisma.generationJob.findUnique({
    where: {
      id: jobId
    },
    include: {
      apiCredential: true,
      parentGame: true,
      remixSourceVersion: true
    }
  });
}

async function addLog(jobId: string, agentName: string, step: string, message: string, metadata?: object) {
  await prisma.agentLog.create({
    data: {
      jobId,
      agentName,
      step,
      message,
      metadata
    }
  });
}

async function updateProgress(jobId: string, progress: number) {
  await prisma.generationJob.update({
    where: {
      id: jobId
    },
    data: {
      progress
    }
  });
}

async function analyzeAsset(asset: InputAsset, modelConfig: JobModelConfig): Promise<AssetAnalysis> {
  const kind = getAssetKind(asset.contentType);
  const base = {
    filename: asset.filename,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    publicUrl: asset.publicUrl,
    kind
  };

  if (kind === "image") {
    try {
      const response = await fetch(asset.publicUrl, { cache: "no-store" });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const dimensions = parseImageDimensions(bytes);
      const dimensionText = dimensions ? `，尺寸约 ${dimensions.width}x${dimensions.height}` : "";
      let visionSummary: string | undefined;

      if (hasModelConfig(modelConfig)) {
        try {
          const base64 = Buffer.from(bytes).toString("base64");
          visionSummary = await completeVisionText(
            "请用中文分析这张用户上传的游戏参考图片。输出 2-4 句，包含画面主体、风格、主色调、可用于游戏的角色/场景/道具建议。不要输出 Markdown。",
            {
              dataUrl: `data:${asset.contentType};base64,${base64}`
            },
            modelConfig
          );
        } catch (error) {
          visionSummary = `视觉模型分析失败：${error instanceof Error ? error.message : "unknown"}`;
        }
      }

      return {
        ...base,
        dimensions: dimensions ?? undefined,
        visionSummary,
        summary: visionSummary
          ? `用户上传了一张图片素材《${asset.filename}》，类型 ${asset.contentType}，大小 ${formatBytes(asset.sizeBytes)}${dimensionText}。视觉分析：${visionSummary}`
          : `用户上传了一张图片素材《${asset.filename}》，类型 ${asset.contentType}，大小 ${formatBytes(asset.sizeBytes)}${dimensionText}。可作为角色、场景、UI 风格或参考图使用。`
      };
    } catch (error) {
      return {
        ...base,
        summary: `用户上传了一张图片素材《${asset.filename}》，但自动读取尺寸失败。仍可通过文件名、类型和用户 prompt 判断其参考用途。`
      };
    }
  }

  if (kind === "text") {
    try {
      const response = await fetch(asset.publicUrl, { cache: "no-store" });
      const text = (await response.text()).slice(0, 2000);

      return {
        ...base,
        textPreview: text,
        summary: `用户上传了文本素材《${asset.filename}》，已提取前 ${text.length} 个字符作为参考内容。`
      };
    } catch {
      return {
        ...base,
        summary: `用户上传了文本素材《${asset.filename}》，但自动读取文本失败。`
      };
    }
  }

  if (kind === "video") {
    return {
      ...base,
      summary: `用户上传了视频素材《${asset.filename}》，类型 ${asset.contentType}，大小 ${formatBytes(asset.sizeBytes)}。当前 MVP 记录素材 URL 和用途提示，可扩展为抽帧或视频理解 Agent。`
    };
  }

  if (kind === "audio") {
    return {
      ...base,
      summary: `用户上传了音频素材《${asset.filename}》，类型 ${asset.contentType}，大小 ${formatBytes(asset.sizeBytes)}。可作为音效或背景音乐参考。`
    };
  }

  return {
    ...base,
    summary: `用户上传了素材文件《${asset.filename}》，类型 ${asset.contentType}，大小 ${formatBytes(asset.sizeBytes)}。`
  };
}

async function runAssetAnalyzerAgent(job: Job, modelConfig: JobModelConfig) {
  const assets = getInputAssets(job);

  if (assets.length === 0) {
    await addLog(job.id, "AssetAnalyzerAgent", "assets_skipped", "本次任务没有上传素材，跳过素材分析。");
    return [];
  }

  const analyses = await Promise.all(assets.map((asset) => analyzeAsset(asset, modelConfig)));
  const artifact = await writeArtifact(job.id, "asset-analysis.v1", analyses);
  await addLog(job.id, "AssetAnalyzerAgent", "assets_analyzed", `已分析 ${analyses.length} 个上传素材。`, {
    analyses,
    artifact
  });
  await updateProgress(job.id, 22);
  return analyses;
}

function buildAssetContext(analyses: AssetAnalysis[]) {
  if (analyses.length === 0) {
    return "本次任务没有上传素材。";
  }

  return analyses
    .map((asset, index) => {
      const dimensions = asset.dimensions ? ` 尺寸：${asset.dimensions.width}x${asset.dimensions.height}。` : "";
      const vision = asset.visionSummary ? ` 视觉摘要：${asset.visionSummary}` : "";
      const textPreview = asset.textPreview ? ` 文本摘录：${asset.textPreview.slice(0, 600)}` : "";
      return `${index + 1}. ${asset.summary}${dimensions}${vision} URL：${asset.publicUrl}.${textPreview}`;
    })
    .join("\n");
}

function validateGeneratedHtml(html: string, assetAnalyses: AssetAnalysis[]) {
  const lowerHtml = html.toLowerCase();
  const forbiddenFileUpload =
    /<input[^>]+type=["']?file/i.test(html) ||
    lowerHtml.includes("filereader") ||
    lowerHtml.includes("createobjecturl");
  const imageAssets = assetAnalyses.filter((asset) => asset.kind === "image");
  const missingUploadedImage =
    imageAssets.length > 0 && !imageAssets.some((asset) => html.includes(asset.publicUrl));

  if (forbiddenFileUpload) {
    return {
      ok: false,
      reason: "生成代码包含游戏内文件上传控件，应使用 Create 阶段已上传到 MinIO 的素材 URL。"
    };
  }

  if (missingUploadedImage) {
    return {
      ok: false,
      reason: "生成代码没有引用本次上传图片的 MinIO publicUrl，无法证明上传素材进入游戏运行时。"
    };
  }

  return {
    ok: true,
    reason: "生成代码通过上传素材使用检查。"
  };
}

async function runPlannerAgent(job: Job, assetAnalyses: AssetAnalysis[], modelConfig: JobModelConfig) {
  let source: "llm" | "fallback" = "fallback";
  let spec: GameSpec = buildFallbackSpec(job.prompt);
  const assetContext = buildAssetContext(assetAnalyses);

  if (hasModelConfig(modelConfig)) {
    try {
      spec = await completeJson<GameSpec>(
        "你是互动游戏策划 Agent。只返回 JSON，不要 Markdown。字段必须包含 title, genre, coreLoop, promptSummary, description, tags。",
        `根据这个用户创意生成一个适合 Web Canvas 小游戏的规格：${job.prompt}\n${getRemixContext(job)}\n\n上传素材分析：\n${assetContext}\n\n如果用户要求使用上传素材，请在规格中明确素材用途，例如角色参考、背景风格、图标或 UI 参考。`,
        modelConfig
      );
      source = "llm";
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      await addLog(job.id, "PlannerAgent", "llm_fallback", "模型生成规格失败，已回退到本地规格生成器。", {
        error: message
      });

      if (shouldFailOnModelError(job)) {
        throw new Error(buildUserKeyFailureMessage(message));
      }
    }
  }

  await addLog(job.id, "PlannerAgent", "spec_created", "已将用户创意整理为游戏规格。", {
    source,
    spec,
    remixContext: getRemixContext(job) || null,
    assetContext,
    artifact: await writeArtifact(job.id, "game-spec.v1", spec)
  });
  await updateProgress(job.id, 30);
  return spec;
}

async function runCoderAgent(job: Job, spec: GameSpec, assetAnalyses: AssetAnalysis[], modelConfig: JobModelConfig, mode: "initial" | "revision" | "fallback" = "initial") {
  const bundlePlan: BundlePlan = {
    entry: "index.html",
    runtime: "iframe sandbox",
    files: ["index.html", "manifest.json"],
    generator: "fallback"
  };
  const assetContext = buildAssetContext(assetAnalyses);

  if (mode !== "fallback" && hasModelConfig(modelConfig)) {
    try {
      const html = await completeText(
        "你是 Web 游戏代码生成 Agent。只返回一个完整可运行的 HTML 文件。禁止外链脚本，禁止任意网络请求，使用内联 CSS/JS 和 Canvas。严禁生成 <input type=\"file\">、文件选择器、拖拽上传区或 FileReader；上传素材已经在 Create 阶段完成。允许且应该使用 AssetAnalyzerAgent 提供的上传素材 publicUrl 作为图片/音频等游戏素材；除这些素材 URL 外，不要加载其他外部资源。",
        `生成一个小游戏 HTML。游戏规格：${JSON.stringify(spec)}。用户原始创意：${job.prompt}。${getRemixContext(job)}\n\n上传素材分析：\n${assetContext}\n\n如果用户提到“使用我上传的图像/素材”，必须直接使用素材 publicUrl 作为游戏里的角色、道具、背景或 UI 图像，并可缩放、裁剪、加光效。不要让玩家在游戏里再次上传文件。`,
        modelConfig
      );
      if (html.includes("<html") && html.includes("</html>")) {
        const validation = validateGeneratedHtml(html, assetAnalyses);

        if (validation.ok) {
          bundlePlan.html = html;
          bundlePlan.generator = "llm";
        } else {
          await addLog(job.id, "CoderAgent", "llm_asset_guardrail", validation.reason, {
            validation,
            assetUrls: assetAnalyses.map((asset) => asset.publicUrl)
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      await addLog(job.id, "CoderAgent", "llm_fallback", "模型生成代码失败，已回退到本地 HTML 生成器。", {
        error: message
      });

      if (shouldFailOnModelError(job)) {
        throw new Error(buildUserKeyFailureMessage(message));
      }
    }
  }

  await addLog(
    job.id,
    "CoderAgent",
    "bundle_planned",
    `已规划 Web 游戏产物结构，代码来源：${bundlePlan.generator}，模式：${mode}。`,
    { spec, bundlePlan, mode, artifact: await writeArtifact(job.id, "code-bundle.v1", bundlePlan) }
  );
  await updateProgress(job.id, 55);
  return bundlePlan;
}

async function runReviewerAgent(job: Job, bundlePlan: BundlePlan, assetAnalyses: AssetAnalysis[]): Promise<ReviewReport> {
  const allowedAssetUrls = assetAnalyses.map((asset) => asset.publicUrl);
  const html = bundlePlan.html ?? "";
  const lowerHtml = html.toLowerCase();
  const hasExternalScripts = /<script[^>]+src=["']/i.test(html);
  const forbiddenFileUpload =
    /<input[^>]+type=["']?file/i.test(html) ||
    lowerHtml.includes("filereader") ||
    lowerHtml.includes("createobjecturl");
  const checks = {
    externalScripts: hasExternalScripts ? "blocked" : "passed",
    sandboxRequired: true,
    maxBundleFiles: 20,
    allowedAssetUrls,
    forbiddenFileUpload: forbiddenFileUpload ? "blocked" : "passed"
  } satisfies ReviewReport["checks"];
  const passed = !hasExternalScripts && !forbiddenFileUpload && bundlePlan.files.length <= checks.maxBundleFiles;
  const report: ReviewReport = {
    passed,
    retryable: !passed,
    reason: passed ? "生成产物通过基础安全规则检查。" : "生成产物未通过基础安全规则，需要 Coder 修订或回退。",
    checks
  };

  await addLog(job.id, "ReviewerAgent", passed ? "review_passed" : "review_failed", report.reason, {
    bundlePlan,
    report,
    artifact: await writeArtifact(job.id, "review-report.v1", report)
  });
  await updateProgress(job.id, 75);
  return report;
}

async function runPublisherAgent(
  job: Job,
  spec: GameSpec,
  bundlePlan: BundlePlan,
  reviewReport: ReviewReport,
  assetAnalyses: AssetAnalysis[]
) {
  const versionNumber = 1;
  const storagePrefix = `games/${job.id}/v${versionNumber}`;
  const runtimeAssetUrls = assetAnalyses.map((asset) => asset.publicUrl);
  const html = bundlePlan.html ?? generateGameHtml(spec, job, assetAnalyses);
  const htmlUpload = await uploadObject({
    key: `${storagePrefix}/index.html`,
    body: html,
    contentType: "text/html; charset=utf-8"
  });

  const coverUpload = await uploadObject({
    key: `${storagePrefix}/cover.svg`,
    body: generateCoverSvg(spec),
    contentType: "image/svg+xml"
  });

  const manifest: RemoteGameManifest = {
    schemaVersion: "1.0",
    title: spec.title,
    entry: "index.html",
    entryUrl: htmlUpload.url,
    bundleUrl: htmlUpload.url,
    assets: [coverUpload.url, ...runtimeAssetUrls],
    permissions: ["keyboard", "pointer"],
    createdByJobId: job.id,
    generatedAt: new Date().toISOString()
  };

  const manifestUpload = await uploadObject({
    key: `${storagePrefix}/manifest.json`,
    body: JSON.stringify(manifest, null, 2),
    contentType: "application/json; charset=utf-8"
  });

  const game = await prisma.game.create({
    data: {
      title: spec.title,
      slug: buildSlug(spec.title, job.id),
      description: spec.description,
      coverUrl: coverUpload.url,
      tags: spec.tags,
      status: GameStatus.PUBLISHED,
      manifestUrl: manifestUpload.url,
      bundleUrl: htmlUpload.url,
      storagePrefix,
      searchText: buildSearchText(spec),
      currentVersionNumber: versionNumber,
      authorId: job.userId,
      createdByJobId: job.id,
      parentGameId: job.parentGameId,
      sourceVersionId: job.remixSourceVersionId,
      publishedAt: new Date()
    }
  });

  const version = await prisma.gameVersion.create({
    data: {
      gameId: game.id,
      versionNumber,
      title: spec.title,
      description: spec.description,
      manifestUrl: manifestUpload.url,
      bundleUrl: htmlUpload.url,
      coverUrl: coverUpload.url,
      storagePrefix,
      jobId: job.id,
      changeSummary: job.parentGame
        ? `Remixed from ${job.parentGame.title} with prompt: ${job.prompt.slice(0, 120)}`
        : "Initial generated version"
    }
  });

  const publishResult = {
    gameId: game.id,
    gameSlug: game.slug,
    versionId: version.id,
    versionNumber: version.versionNumber,
    manifestUrl: manifestUpload.url,
    bundleUrl: htmlUpload.url,
    coverUrl: coverUpload.url,
    storagePrefix,
    runtimeAssetUrls,
    parentGameId: job.parentGameId,
    remixSourceVersionId: job.remixSourceVersionId,
    spec,
    bundlePlan,
    reviewReport
  };

  await addLog(
    job.id,
    "PublisherAgent",
    "game_published",
    "已生成游戏 HTML、Manifest 和封面，并上传到 MinIO，同时创建已发布 Game 记录。",
    {
      ...publishResult,
      artifact: await writeArtifact(
        job.id,
        "publish-result.v1",
        publishResult,
        `${storagePrefix}/manifest.json`,
        manifestUpload.url
      )
    }
  );
  await updateProgress(job.id, 95);
  return publishResult;
}

const GenerationGraphState = Annotation.Root({
  job: Annotation<Job>(),
  modelConfig: Annotation<JobModelConfig>({
    reducer: (_, next) => next,
    default: () => null
  }),
  assetAnalyses: Annotation<AssetAnalysis[]>({
    reducer: (_, next) => next,
    default: () => []
  }),
  spec: Annotation<GameSpec | undefined>({
    reducer: (_, next) => next,
    default: () => undefined
  }),
  bundlePlan: Annotation<BundlePlan | undefined>({
    reducer: (_, next) => next,
    default: () => undefined
  }),
  reviewReport: Annotation<ReviewReport | undefined>({
    reducer: (_, next) => next,
    default: () => undefined
  }),
  retryCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0
  }),
  artifactRefs: Annotation<ArtifactRef[]>({
    reducer: (current, next) => [...current, ...next],
    default: () => []
  }),
  publishResult: Annotation<PublishResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined
  }),
  costEstimate: Annotation<CostEstimate | undefined>({
    reducer: (_, next) => next,
    default: () => undefined
  })
});

function createGenerationGraph() {
  return new StateGraph(GenerationGraphState)
    .addNode("asset_analyzer", async (state) => {
      const assetAnalyses = await runAssetAnalyzerAgent(state.job, state.modelConfig);
      await wait(250);
      return { assetAnalyses };
    })
    .addNode("planner", async (state) => {
      const spec = await runPlannerAgent(state.job, state.assetAnalyses, state.modelConfig);
      await wait(250);
      return { spec };
    })
    .addNode("coder", async (state) => {
      if (!state.spec) {
        throw new Error("PlannerAgent did not produce a game spec.");
      }

      const bundlePlan = await runCoderAgent(state.job, state.spec, state.assetAnalyses, state.modelConfig);
      await wait(250);
      return { bundlePlan };
    })
    .addNode("coder_revision", async (state) => {
      if (!state.spec) {
        throw new Error("CoderRevisionAgent is missing a game spec.");
      }

      await addLog(
        state.job.id,
        "CoderRevisionAgent",
        "revision_started",
        "Reviewer 未通过，开始生成修订版产物。"
      );
      const bundlePlan = await runCoderAgent(state.job, state.spec, state.assetAnalyses, state.modelConfig, "revision");
      await wait(250);
      return { bundlePlan, retryCount: state.retryCount + 1 };
    })
    .addNode("fallback_coder", async (state) => {
      if (!state.spec) {
        throw new Error("FallbackCoderAgent is missing a game spec.");
      }

      await addLog(
        state.job.id,
        "FallbackCoderAgent",
        "fallback_started",
        "Reviewer 多次未通过，切换到本地安全模板生成器。"
      );
      const bundlePlan = await runCoderAgent(state.job, state.spec, state.assetAnalyses, state.modelConfig, "fallback");
      await wait(250);
      return { bundlePlan, retryCount: state.retryCount + 1 };
    })
    .addNode("reviewer", async (state) => {
      if (!state.bundlePlan) {
        throw new Error("CoderAgent did not produce a bundle plan.");
      }

      const reviewReport = await runReviewerAgent(state.job, state.bundlePlan, state.assetAnalyses);
      await wait(250);
      return { reviewReport };
    })
    .addNode("publisher", async (state) => {
      if (!state.spec || !state.bundlePlan || !state.reviewReport) {
        throw new Error("PublisherAgent is missing upstream generation state.");
      }

      const publishResult = await runPublisherAgent(
        state.job,
        state.spec,
        state.bundlePlan,
        state.reviewReport,
        state.assetAnalyses
      );
      return { publishResult };
    })
    .addNode("cost", async (state) => {
      if (!state.spec || !state.bundlePlan) {
        throw new Error("CostAgent is missing spec or bundle plan.");
      }

      const costEstimate = estimateGenerationCost(state.job, state.spec, state.bundlePlan, state.modelConfig);
      await addLog(state.job.id, "CostAgent", "cost_estimated", "已估算本次生成 token 与成本。", {
        ...costEstimate,
        artifact: await writeArtifact(state.job.id, "cost-report.v1", costEstimate)
      });
      return { costEstimate };
    })
    .addEdge(START, "asset_analyzer")
    .addEdge("asset_analyzer", "planner")
    .addEdge("planner", "coder")
    .addEdge("coder", "reviewer")
    .addEdge("coder_revision", "reviewer")
    .addEdge("fallback_coder", "reviewer")
    .addConditionalEdges(
      "reviewer",
      (state) => {
        if (state.reviewReport?.passed) return "publisher";
        if ((state.retryCount ?? 0) < 2) return "coder_revision";
        return "fallback_coder";
      },
      {
        publisher: "publisher",
        coder_revision: "coder_revision",
        fallback_coder: "fallback_coder"
      }
    )
    .addEdge("publisher", "cost")
    .addEdge("cost", END)
    .compile();
}

async function runClaimedJob(job: Job) {
  try {
    resetModelUsage();
    const modelConfig = getJobModelConfig(job);

    if (job.apiCredentialSource === ApiCredentialSource.USER_KEY && job.apiCredentialId) {
      await prisma.userApiCredential.update({
        where: { id: job.apiCredentialId },
        data: { lastUsedAt: new Date() }
      });
    }

    await addLog(
      job.id,
      "System",
      "api_config_selected",
      modelConfig ? "本次生成将使用用户自带 API 配置。" : "本次生成将使用平台默认 API 配置或本地生成器。",
      {
        source: job.apiCredentialSource,
        apiCredentialId: job.apiCredentialId,
        modelName: modelConfig?.modelName ?? null,
        wireApi: modelConfig?.wireApi ?? null
      }
    );
    const graph = createGenerationGraph();
    const result = await graph.invoke({ job, modelConfig });

    if (!result.spec || !result.bundlePlan || !result.reviewReport || !result.publishResult || !result.costEstimate) {
      throw new Error("LangGraph generation finished with incomplete state.");
    }

    await prisma.generationJob.update({
      where: {
        id: job.id
      },
      data: {
        status: GenerationJobStatus.SUCCEEDED,
        progress: 100,
        finishedAt: new Date(),
        modelInputTokens: result.costEstimate.inputTokens,
        modelOutputTokens: result.costEstimate.outputTokens,
        estimatedCostCents: result.costEstimate.estimatedCostCents,
        result: {
          orchestration: "langgraph",
          artifactDriven: true,
          spec: result.spec,
          bundlePlan: result.bundlePlan,
          reviewReport: result.reviewReport,
          publishResult: result.publishResult,
          costEstimate: result.costEstimate
        },
        logs: {
          create: {
            agentName: "Worker",
            step: "job_finished",
            message: "Agent 流水线已完成，任务状态更新为已完成。"
          }
        }
      }
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "未知错误";
    const message =
      job.apiCredentialSource === ApiCredentialSource.USER_KEY && !rawMessage.startsWith("你的自带 API")
        ? buildUserKeyFailureMessage(rawMessage)
        : rawMessage;

    await prisma.generationJob.update({
      where: {
        id: job.id
      },
      data: {
        status: GenerationJobStatus.FAILED,
        error: message,
        finishedAt: new Date(),
        logs: {
          create: {
            agentName: "Worker",
            step: "job_failed",
            message
          }
        }
      }
    });
  }
}

async function processQueuedJob(payload: GenerationQueuePayload) {
  const job = await claimJob(payload.jobId);

  if (!job) {
    console.log(`Skipping generation job ${payload.jobId}; it is not pending.`);
    return;
  }

  console.log(`Processing generation job ${job.id}`);
  await runClaimedJob(job);
  console.log(`Finished generation job ${job.id}`);
}

const generationWorker = new BullWorker<GenerationQueuePayload, void, typeof GENERATION_JOB_NAME>(
  GENERATION_QUEUE_NAME,
  async (queueJob) => {
    if (queueJob.name !== GENERATION_JOB_NAME) {
      throw new Error(`Unsupported queue job: ${queueJob.name}`);
    }

    await processQueuedJob(queueJob.data);
  },
  {
    connection: createBullMqConnectionOptions(),
    concurrency: Number(process.env.GENERATION_WORKER_CONCURRENCY ?? 2)
  }
);

async function main() {
  console.log(`Generator worker started. Listening on BullMQ queue "${GENERATION_QUEUE_NAME}"...`);

  generationWorker.on("failed", (job, error) => {
    console.error(`Queue job ${job?.id ?? "unknown"} failed`, error);
  });
}

process.on("SIGINT", async () => {
  await generationWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await generationWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

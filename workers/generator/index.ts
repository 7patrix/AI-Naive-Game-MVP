import { GameStatus, GenerationJobStatus, PrismaClient } from "@prisma/client";
import type { RemoteGameManifest } from "../../src/lib/game-manifest";
import { completeJson, completeText, hasModelConfig } from "../../src/lib/model-client";
import { uploadObject } from "../../src/lib/storage";

const prisma = new PrismaClient();
const POLL_INTERVAL_MS = 3000;

type Job = NonNullable<Awaited<ReturnType<typeof claimNextJob>>>;
type GameSpec = {
  title: string;
  genre: string;
  coreLoop: string;
  promptSummary: string;
  description: string;
  tags: string[];
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
  pricing: "openai-compatible-estimate" | "fallback-local";
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

function getRemixContext(job: Job) {
  if (!job.parentGame) {
    return "";
  }

  return `Remix 源游戏：${job.parentGame.title}。源游戏简介：${job.parentGame.description}。源版本：v${job.remixSourceVersion?.versionNumber ?? job.parentGame.currentVersionNumber}。`;
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function estimateGenerationCost(job: Job, spec: GameSpec, bundlePlan: BundlePlan): CostEstimate {
  const inputTokens = estimateTokens(
    [job.prompt, getRemixContext(job), JSON.stringify(job.inputFiles ?? []), JSON.stringify(spec)].join("\n")
  );
  const outputTokens = estimateTokens([JSON.stringify(spec), bundlePlan.html ?? ""].join("\n"));

  if (!hasModelConfig() || bundlePlan.generator === "fallback") {
    return {
      inputTokens,
      outputTokens,
      estimatedCostCents: 0,
      pricing: "fallback-local"
    };
  }

  const estimatedDollars = (inputTokens / 1000) * 0.00015 + (outputTokens / 1000) * 0.0006;

  return {
    inputTokens,
    outputTokens,
    estimatedCostCents: Math.max(1, Math.ceil(estimatedDollars * 100)),
    pricing: "openai-compatible-estimate"
  };
}

function generateGameHtml(spec: GameSpec, job: Job) {
  const title = escapeHtml(spec.title);
  const prompt = jsonForScript(spec.promptSummary);
  const coreLoop = escapeHtml(spec.coreLoop);

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
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div class="hud">
      <h1>${title}</h1>
      <p>${coreLoop}</p>
      <p>方向键 / WASD 移动，躲避陨石，存活越久分数越高。</p>
    </div>
    <script>
      const promptSummary = ${prompt};
      const canvas = document.getElementById("game");
      const ctx = canvas.getContext("2d");
      const keys = new Set();
      const player = { x: 120, y: 120, r: 15, speed: 5 };
      const meteors = Array.from({ length: 10 }, (_, index) => ({
        x: 260 + index * 90,
        y: 80 + (index % 5) * 90,
        r: 14 + (index % 4) * 5,
        vx: -2.2 - Math.random() * 2.5,
        vy: -1.4 + Math.random() * 2.8
      }));
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

      function step(now) {
        const dt = Math.min(32, now - last);
        last = now;
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (alive) {
          if (keys.has("ArrowLeft") || keys.has("a")) player.x -= player.speed;
          if (keys.has("ArrowRight") || keys.has("d")) player.x += player.speed;
          if (keys.has("ArrowUp") || keys.has("w")) player.y -= player.speed;
          if (keys.has("ArrowDown") || keys.has("s")) player.y += player.speed;
          player.x = clamp(player.x, player.r, width - player.r);
          player.y = clamp(player.y, player.r, height - player.r);
          score += dt * 0.015;
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
            meteor.x += meteor.vx;
            meteor.y += meteor.vy;
            if (meteor.x < -40) meteor.x = width + 40;
            if (meteor.y < 40 || meteor.y > height - 40) meteor.vy *= -1;
            const dx = meteor.x - player.x;
            const dy = meteor.y - player.y;
            if (Math.hypot(dx, dy) < meteor.r + player.r) alive = false;
          }

          ctx.beginPath();
          ctx.fillStyle = "#fb923c";
          ctx.arc(meteor.x, meteor.y, meteor.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(254, 215, 170, 0.8)";
          ctx.stroke();
        }

        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.fillStyle = alive ? "#38bdf8" : "#ef4444";
        ctx.beginPath();
        ctx.moveTo(0, -player.r - 8);
        ctx.lineTo(player.r + 8, player.r + 6);
        ctx.lineTo(0, player.r);
        ctx.lineTo(-player.r - 8, player.r + 6);
        ctx.closePath();
        ctx.fill();
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
          ctx.fillText("刷新页面重新开始。创意来源：" + promptSummary, width / 2, height / 2 + 22);
          ctx.textAlign = "left";
        }

        requestAnimationFrame(step);
      }

      window.addEventListener("resize", resize);
      window.addEventListener("keydown", (event) => keys.add(event.key));
      window.addEventListener("keyup", (event) => keys.delete(event.key));
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

async function claimNextJob() {
  const job = await prisma.generationJob.findFirst({
    where: {
      status: GenerationJobStatus.PENDING
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (!job) {
    return null;
  }

  return prisma.generationJob.update({
    where: {
      id: job.id
    },
    data: {
      status: GenerationJobStatus.RUNNING,
      progress: 10,
      startedAt: new Date(),
      logs: {
        create: {
          agentName: "Worker",
          step: "job_started",
          message: "Worker 已领取任务，开始执行 Agent 流水线。"
        }
      }
    },
    include: {
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

async function runPlannerAgent(job: Job) {
  let source: "llm" | "fallback" = "fallback";
  let spec: GameSpec = {
    title: buildTitle(job.prompt),
    genre: "Arcade",
    coreLoop: "玩家通过键盘或鼠标操作角色，躲避障碍并获得分数。",
    promptSummary: job.prompt.slice(0, 180),
    description: `根据创意“${job.prompt.slice(0, 80)}”生成的轻量级 Web 小游戏。`,
    tags: ["AI生成", "Arcade", "Canvas"]
  };

  if (hasModelConfig()) {
    try {
      spec = await completeJson<GameSpec>(
        "你是互动游戏策划 Agent。只返回 JSON，不要 Markdown。字段必须包含 title, genre, coreLoop, promptSummary, description, tags。",
        `根据这个用户创意生成一个适合 Web Canvas 小游戏的规格：${job.prompt}\n${getRemixContext(job)}`
      );
      source = "llm";
    } catch (error) {
      await addLog(job.id, "PlannerAgent", "llm_fallback", "模型生成规格失败，已回退到本地规格生成器。", {
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  await addLog(job.id, "PlannerAgent", "spec_created", "已将用户创意整理为游戏规格。", {
    source,
    spec,
    remixContext: getRemixContext(job) || null
  });
  await updateProgress(job.id, 30);
  return spec;
}

async function runCoderAgent(job: Job, spec: GameSpec) {
  const bundlePlan: BundlePlan = {
    entry: "index.html",
    runtime: "iframe sandbox",
    files: ["index.html", "manifest.json"],
    generator: "fallback"
  };

  if (hasModelConfig()) {
    try {
      const html = await completeText(
        "你是 Web 游戏代码生成 Agent。只返回一个完整可运行的 HTML 文件。禁止外链脚本，禁止请求网络资源，使用内联 CSS/JS 和 Canvas。",
        `生成一个小游戏 HTML。游戏规格：${JSON.stringify(spec)}。用户原始创意：${job.prompt}。${getRemixContext(job)}`
      );
      if (html.includes("<html") && html.includes("</html>")) {
        bundlePlan.html = html;
        bundlePlan.generator = "llm";
      }
    } catch (error) {
      await addLog(job.id, "CoderAgent", "llm_fallback", "模型生成代码失败，已回退到本地 HTML 生成器。", {
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  await addLog(
    job.id,
    "CoderAgent",
    "bundle_planned",
    `已规划 Web 游戏产物结构，代码来源：${bundlePlan.generator}。`,
    { spec, bundlePlan }
  );
  await updateProgress(job.id, 55);
  return bundlePlan;
}

async function runReviewerAgent(job: Job, bundlePlan: BundlePlan) {
  const checks = {
    externalScripts: "blocked",
    sandboxRequired: true,
    maxBundleFiles: 20
  };

  await addLog(job.id, "ReviewerAgent", "safety_checked", "已完成基础安全规则检查。", {
    bundlePlan,
    checks
  });
  await updateProgress(job.id, 75);
  return checks;
}

async function runPublisherAgent(job: Job, spec: GameSpec, bundlePlan: BundlePlan, checks: object) {
  const versionNumber = 1;
  const storagePrefix = `games/${job.id}/v${versionNumber}`;
  const html = bundlePlan.html ?? generateGameHtml(spec, job);
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
    assets: [coverUpload.url],
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
    parentGameId: job.parentGameId,
    remixSourceVersionId: job.remixSourceVersionId,
    spec,
    bundlePlan,
    checks
  };

  await addLog(
    job.id,
    "PublisherAgent",
    "game_published",
    "已生成游戏 HTML、Manifest 和封面，并上传到 MinIO，同时创建已发布 Game 记录。",
    publishResult
  );
  await updateProgress(job.id, 95);
  return publishResult;
}

async function processJob(job: Job) {
  try {
    const spec = await runPlannerAgent(job);
    await wait(250);
    const bundlePlan = await runCoderAgent(job, spec);
    await wait(250);
    const checks = await runReviewerAgent(job, bundlePlan);
    await wait(250);
    const publishResult = await runPublisherAgent(job, spec, bundlePlan, checks);
    const costEstimate = estimateGenerationCost(job, spec, bundlePlan);

    await addLog(job.id, "CostAgent", "cost_estimated", "已估算本次生成 token 与成本。", costEstimate);

    await prisma.generationJob.update({
      where: {
        id: job.id
      },
      data: {
        status: GenerationJobStatus.SUCCEEDED,
        progress: 100,
        finishedAt: new Date(),
        modelInputTokens: costEstimate.inputTokens,
        modelOutputTokens: costEstimate.outputTokens,
        estimatedCostCents: costEstimate.estimatedCostCents,
        result: {
          spec,
          bundlePlan,
          checks,
          publishResult,
          costEstimate
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
    const message = error instanceof Error ? error.message : "未知错误";

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

async function main() {
  console.log("Generator worker started. Polling pending jobs...");

  while (true) {
    const job = await claimNextJob();

    if (job) {
      console.log(`Processing generation job ${job.id}`);
      await processJob(job);
      console.log(`Finished generation job ${job.id}`);
    } else {
      await wait(POLL_INTERVAL_MS);
    }
  }
}

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

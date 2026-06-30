import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GameStatus, GenerationJobStatus, PrismaClient } from "@prisma/client";
import type { RemoteGameManifest } from "../src/lib/game-manifest";
import { uploadObject } from "../src/lib/storage";

const prisma = new PrismaClient();
const generatedJobId = "seed-generated-forest-spirit-guardian-job";

type SeedGame = {
  title: string;
  slug: string;
  description: string;
  tags: string[];
  source: "basic" | "generated";
};

function buildSearchText(game: SeedGame) {
  return [game.title, game.description, ...game.tags].join(" ").toLowerCase();
}

function generateBasicHtml(game: SeedGame) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${game.title}</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #020617; color: #e2e8f0; font-family: system-ui, sans-serif; }
      canvas { display: block; width: 100vw; height: 100vh; }
      .hud { position: fixed; left: 20px; top: 20px; max-width: 520px; border: 1px solid rgba(255,255,255,.18); border-radius: 18px; background: rgba(15,23,42,.72); padding: 14px 16px; backdrop-filter: blur(12px); }
      .hud h1 { margin: 0 0 8px; font-size: 20px; }
      .hud p { margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.6; }
      .end { position: fixed; inset: 0; display: none; place-items: center; background: rgba(2,6,23,.72); text-align: center; }
      .end button { margin-top: 16px; border: 0; border-radius: 999px; padding: 12px 22px; background: #6366f1; color: white; font-weight: 700; cursor: pointer; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div class="hud">
      <h1>${game.title}</h1>
      <p>${game.description}</p>
      <p>方向键 / WASD 移动，收集光点，躲避橙色障碍。</p>
    </div>
    <div class="end" id="end">
      <div>
        <h2>游戏结束</h2>
        <p id="final"></p>
        <button id="restart">重新开始</button>
      </div>
    </div>
    <script>
      const canvas = document.getElementById("game");
      const ctx = canvas.getContext("2d");
      const end = document.getElementById("end");
      const final = document.getElementById("final");
      const keys = new Set();
      const player = { x: 160, y: 160, r: 18, speed: 5 };
      let score = 0;
      let alive = true;
      let last = performance.now();
      let orbs = [];
      let hazards = [];

      function resize() {
        canvas.width = innerWidth * devicePixelRatio;
        canvas.height = innerHeight * devicePixelRatio;
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      }

      function reset() {
        score = 0;
        alive = true;
        player.x = 160;
        player.y = 160;
        end.style.display = "none";
        orbs = Array.from({ length: 8 }, () => ({ x: 80 + Math.random() * (innerWidth - 160), y: 90 + Math.random() * (innerHeight - 180), r: 10 }));
        hazards = Array.from({ length: 8 }, (_, i) => ({ x: 260 + i * 95, y: 110 + (i % 4) * 100, r: 18, vx: -2 - Math.random() * 2, vy: -1.2 + Math.random() * 2.4 }));
      }

      function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

      function gameOver() {
        alive = false;
        final.textContent = "Score: " + Math.floor(score);
        end.style.display = "grid";
      }

      function step(now) {
        const dt = Math.min(32, now - last);
        last = now;
        if (alive) {
          if (keys.has("ArrowLeft") || keys.has("a")) player.x -= player.speed;
          if (keys.has("ArrowRight") || keys.has("d")) player.x += player.speed;
          if (keys.has("ArrowUp") || keys.has("w")) player.y -= player.speed;
          if (keys.has("ArrowDown") || keys.has("s")) player.y += player.speed;
          player.x = clamp(player.x, player.r, innerWidth - player.r);
          player.y = clamp(player.y, player.r, innerHeight - player.r);
          score += dt * 0.01;
        }

        const gradient = ctx.createLinearGradient(0, 0, innerWidth, innerHeight);
        gradient.addColorStop(0, "#0f172a");
        gradient.addColorStop(1, "#3730a3");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, innerWidth, innerHeight);

        for (const orb of orbs) {
          if (alive && Math.hypot(player.x - orb.x, player.y - orb.y) < player.r + orb.r) {
            score += 20;
            orb.x = 80 + Math.random() * (innerWidth - 160);
            orb.y = 90 + Math.random() * (innerHeight - 180);
          }
          ctx.fillStyle = "#38bdf8";
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const hazard of hazards) {
          if (alive) {
            hazard.x += hazard.vx;
            hazard.y += hazard.vy;
            if (hazard.x < -40) hazard.x = innerWidth + 40;
            if (hazard.y < 60 || hazard.y > innerHeight - 40) hazard.vy *= -1;
            if (Math.hypot(player.x - hazard.x, player.y - hazard.y) < player.r + hazard.r) gameOver();
          }
          ctx.fillStyle = "#fb923c";
          ctx.beginPath();
          ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 22px system-ui";
        ctx.fillText("Score: " + Math.floor(score), 24, innerHeight - 32);
        requestAnimationFrame(step);
      }

      addEventListener("keydown", (event) => keys.add(event.key));
      addEventListener("keyup", (event) => keys.delete(event.key));
      addEventListener("message", (event) => {
        if (!event.data || event.data.type !== "AI_ARCADE_KEY") return;
        if (event.data.phase === "keydown") keys.add(event.data.key);
        if (event.data.phase === "keyup") keys.delete(event.data.key);
      });
      document.getElementById("restart").addEventListener("click", reset);
      addEventListener("resize", resize);
      resize();
      reset();
      requestAnimationFrame(step);
    </script>
  </body>
</html>`;
}

function generateCoverSvg(title: string) {
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
  <text x="82" y="390" fill="rgba(255,255,255,0.82)" font-family="Arial, sans-serif" font-size="28">Seed playable demo</text>
</svg>`;
}

async function uploadBasicSeedAssets(game: SeedGame) {
  const prefix = `seeds/${game.slug}`;
  const htmlUpload = await uploadObject({
    key: `${prefix}/index.html`,
    body: generateBasicHtml(game),
    contentType: "text/html; charset=utf-8"
  });
  const coverUpload = await uploadObject({
    key: `${prefix}/cover.svg`,
    body: generateCoverSvg(game.title),
    contentType: "image/svg+xml"
  });
  const manifest: RemoteGameManifest = {
    schemaVersion: "1.0",
    title: game.title,
    entry: "index.html",
    entryUrl: htmlUpload.url,
    bundleUrl: htmlUpload.url,
    assets: [coverUpload.url],
    permissions: ["keyboard", "pointer", "touch"],
    supportedDevices: ["desktop", "mobile"],
    inputMethods: ["keyboard", "pointer", "touch"],
    orientation: "any",
    inputSchemaVersion: "2.0",
    controlHints: {
      movement: "键盘 / WASD / 虚拟摇杆移动",
      primaryAction: "点击或动作按钮触发主动作",
      restartAction: "R 键或重开按钮重新开始"
    },
    createdByJobId: `seed-${game.slug}`,
    generatedAt: new Date().toISOString()
  };
  const manifestUpload = await uploadObject({
    key: `${prefix}/manifest.json`,
    body: JSON.stringify(manifest, null, 2),
    contentType: "application/json; charset=utf-8"
  });

  return {
    storagePrefix: prefix,
    manifestUrl: manifestUpload.url,
    bundleUrl: htmlUpload.url,
    coverUrl: coverUpload.url
  };
}

async function uploadGeneratedSeedAssets() {
  const prefix = "seeds/generated/forest-spirit-guardian";
  const basePath = resolve(process.cwd(), "v1");
  const playerUpload = await uploadObject({
    key: `${prefix}/player.png`,
    body: readFileSync(resolve(basePath, "player.png")),
    contentType: "image/png"
  });
  const html = readFileSync(resolve(basePath, "index.html"), "utf8").replaceAll(
    "__PLAYER_IMAGE_URL__",
    playerUpload.url
  );
  const htmlUpload = await uploadObject({
    key: `${prefix}/index.html`,
    body: html,
    contentType: "text/html; charset=utf-8"
  });
  const coverUpload = await uploadObject({
    key: `${prefix}/cover.svg`,
    body: readFileSync(resolve(basePath, "cover.svg")),
    contentType: "image/svg+xml"
  });
  const manifestTemplate = readFileSync(resolve(basePath, "manifest.json"), "utf8")
    .replaceAll("__ENTRY_URL__", htmlUpload.url)
    .replaceAll("__BUNDLE_URL__", htmlUpload.url)
    .replaceAll("__COVER_URL__", coverUpload.url)
    .replaceAll("__PLAYER_IMAGE_URL__", playerUpload.url);
  const manifestUpload = await uploadObject({
    key: `${prefix}/manifest.json`,
    body: manifestTemplate,
    contentType: "application/json; charset=utf-8"
  });

  return {
    storagePrefix: prefix,
    manifestUrl: manifestUpload.url,
    bundleUrl: htmlUpload.url,
    coverUrl: coverUpload.url,
    playerUrl: playerUpload.url
  };
}

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const user = await prisma.user.upsert({
    where: { email: "creator@example.com" },
    update: {
      emailVerifiedAt: new Date()
    },
    create: {
      email: "creator@example.com",
      name: "Demo Creator",
      emailVerifiedAt: new Date(),
      passwordHash
    }
  });

  const games: SeedGame[] = [
    {
      title: "Nebula Dodger",
      slug: "nebula-dodger",
      description: "Pilot a tiny ship through an asteroid storm and survive for 60 seconds.",
      tags: ["Arcade", "Space"],
      source: "basic"
    },
    {
      title: "Forest Rhythm",
      slug: "forest-rhythm",
      description: "Tap glowing spirits in rhythm to restore light to an enchanted forest.",
      tags: ["Music", "Casual"],
      source: "basic"
    },
    {
      title: "Puzzle Bot Lab",
      slug: "puzzle-bot-lab",
      description: "Program a small robot with short commands to unlock doors and collect stars.",
      tags: ["Puzzle", "Logic"],
      source: "basic"
    },
    {
      title: "森林精灵守护战",
      slug: "forest-spirit-guardian",
      description:
        "由 Create 流程生成的 AI 游戏样例：直接使用上传图片作为森林精灵主角，点击暗影球并收集魔法光点守护森林。",
      tags: ["AI生成", "Vision", "森林", "素材入游"],
      source: "generated"
    }
  ];

  for (const game of games) {
    const uploaded =
      game.source === "generated" ? await uploadGeneratedSeedAssets() : await uploadBasicSeedAssets(game);
    const createdByJobId = game.source === "generated" ? generatedJobId : undefined;
    const playerUrl = "playerUrl" in uploaded && typeof uploaded.playerUrl === "string" ? uploaded.playerUrl : "";

    if (game.source === "generated") {
      await prisma.generationJob.upsert({
        where: { id: generatedJobId },
        update: {
          prompt:
            "Seed 样例：基于上传图片创建森林魔法精灵守护小游戏，直接使用上传图片作为主角素材。",
          status: GenerationJobStatus.SUCCEEDED,
          progress: 100,
          moderationStatus: "APPROVED",
          inputFiles: [
            {
              filename: "player.png",
              contentType: "image/png",
              sizeBytes: 0,
              publicUrl: playerUrl
            }
          ],
          result: {
            seeded: true,
            manifestUrl: uploaded.manifestUrl,
            bundleUrl: uploaded.bundleUrl
          },
          startedAt: new Date(),
          finishedAt: new Date()
        },
        create: {
          id: generatedJobId,
          prompt:
            "Seed 样例：基于上传图片创建森林魔法精灵守护小游戏，直接使用上传图片作为主角素材。",
          status: GenerationJobStatus.SUCCEEDED,
          progress: 100,
          moderationStatus: "APPROVED",
          inputFiles: [
            {
              filename: "player.png",
              contentType: "image/png",
              sizeBytes: 0,
              publicUrl: playerUrl
            }
          ],
          result: {
            seeded: true,
            manifestUrl: uploaded.manifestUrl,
            bundleUrl: uploaded.bundleUrl
          },
          startedAt: new Date(),
          finishedAt: new Date(),
          userId: user.id
        }
      });

      await prisma.agentLog.deleteMany({ where: { jobId: generatedJobId } });
      await prisma.agentLog.createMany({
        data: [
          {
            jobId: generatedJobId,
            agentName: "AssetAnalyzerAgent",
            step: "assets_analyzed",
            message: "Seed 样例已分析上传图片素材，并将图片作为运行时角色素材。"
          },
          {
            jobId: generatedJobId,
            agentName: "PublisherAgent",
            step: "game_published",
            message: "Seed 样例已上传 HTML、Manifest、封面和玩家图片到 MinIO。"
          }
        ]
      });
    }

    const savedGame = await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        title: game.title,
        slug: game.slug,
        description: game.description,
        tags: game.tags,
        coverUrl: uploaded.coverUrl,
        manifestUrl: uploaded.manifestUrl,
        bundleUrl: uploaded.bundleUrl,
        storagePrefix: uploaded.storagePrefix,
        status: GameStatus.PUBLISHED,
        searchText: buildSearchText(game),
        currentVersionNumber: 1,
        createdByJobId,
        publishedAt: new Date()
      },
      create: {
        title: game.title,
        slug: game.slug,
        description: game.description,
        tags: game.tags,
        coverUrl: uploaded.coverUrl,
        manifestUrl: uploaded.manifestUrl,
        bundleUrl: uploaded.bundleUrl,
        storagePrefix: uploaded.storagePrefix,
        status: GameStatus.PUBLISHED,
        searchText: buildSearchText(game),
        currentVersionNumber: 1,
        publishedAt: new Date(),
        authorId: user.id,
        createdByJobId
      }
    });

    await prisma.gameVersion.upsert({
      where: {
        gameId_versionNumber: {
          gameId: savedGame.id,
          versionNumber: 1
        }
      },
      update: {
        title: savedGame.title,
        description: savedGame.description,
        manifestUrl: uploaded.manifestUrl,
        bundleUrl: uploaded.bundleUrl,
        coverUrl: uploaded.coverUrl,
        storagePrefix: uploaded.storagePrefix,
        jobId: createdByJobId,
        changeSummary: game.source === "generated" ? "Seeded from a Create-generated AI game" : "Seed demo version"
      },
      create: {
        gameId: savedGame.id,
        versionNumber: 1,
        title: savedGame.title,
        description: savedGame.description,
        manifestUrl: uploaded.manifestUrl,
        bundleUrl: uploaded.bundleUrl,
        coverUrl: uploaded.coverUrl,
        storagePrefix: uploaded.storagePrefix,
        jobId: createdByJobId,
        changeSummary: game.source === "generated" ? "Seeded from a Create-generated AI game" : "Seed demo version"
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

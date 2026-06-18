import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const user = await prisma.user.upsert({
    where: { email: "creator@example.com" },
    update: {},
    create: {
      email: "creator@example.com",
      name: "Demo Creator",
      passwordHash
    }
  });

  const games = [
    {
      title: "Nebula Dodger",
      slug: "nebula-dodger",
      description: "Pilot a tiny ship through an asteroid storm and survive for 60 seconds.",
      tags: ["Arcade", "Space"],
      coverUrl: "https://placehold.co/800x450/4f46e5/ffffff?text=Nebula+Dodger",
      manifestUrl: "http://localhost:9000/ai-arcade/seeds/nebula-dodger/manifest.json",
      bundleUrl: "http://localhost:9000/ai-arcade/seeds/nebula-dodger/index.html"
    },
    {
      title: "Forest Rhythm",
      slug: "forest-rhythm",
      description: "Tap glowing spirits in rhythm to restore light to an enchanted forest.",
      tags: ["Music", "Casual"],
      coverUrl: "https://placehold.co/800x450/16a34a/ffffff?text=Forest+Rhythm",
      manifestUrl: "http://localhost:9000/ai-arcade/seeds/forest-rhythm/manifest.json",
      bundleUrl: "http://localhost:9000/ai-arcade/seeds/forest-rhythm/index.html"
    },
    {
      title: "Puzzle Bot Lab",
      slug: "puzzle-bot-lab",
      description: "Program a small robot with short commands to unlock doors and collect stars.",
      tags: ["Puzzle", "Logic"],
      coverUrl: "https://placehold.co/800x450/0f172a/ffffff?text=Puzzle+Bot+Lab",
      manifestUrl: "http://localhost:9000/ai-arcade/seeds/puzzle-bot-lab/manifest.json",
      bundleUrl: "http://localhost:9000/ai-arcade/seeds/puzzle-bot-lab/index.html"
    }
  ];

  for (const game of games) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        ...game,
        status: "PUBLISHED",
        publishedAt: new Date()
      },
      create: {
        ...game,
        status: "PUBLISHED",
        publishedAt: new Date(),
        storagePrefix: `seeds/${game.slug}`,
        authorId: user.id
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

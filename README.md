# AI Arcade MVP

AI Arcade is a two-day MVP for an AI native interactive game web platform. The goal is to prove the full loop from authentication to creation, publishing, browsing, and dynamic gameplay.

## Tech Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- PostgreSQL with Prisma
- MinIO as local S3-compatible object storage
- Node.js worker for async game generation
- iframe sandbox for remote game playback isolation

## Prerequisites

- Node.js with npm available in PATH
- Docker Desktop with Docker Compose

The current repo includes the project scaffold and infrastructure configuration. If `npm` or `docker` is missing from the terminal, install or enable them before running the commands below.

## Local Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- App: http://localhost:3000
- MinIO console: http://localhost:9001

Default MinIO credentials:

- Username: `minioadmin`
- Password: `minioadmin`

Seed account:

- Email: `creator@example.com`
- Password: `Password123!`

## Current Status

Implemented in the first stage:

- Next.js TypeScript project scaffold
- Tailwind and global layout
- Home, Login, and Create placeholder pages
- Docker Compose for PostgreSQL and MinIO
- MinIO bucket initialization
- Prisma schema for users, sessions, games, generation jobs, agent logs, uploads, and play events
- Seed script for one demo user and three published games

Next stage:

- Email registration and login
- Session cookie validation
- Protected routes and auth-aware navigation
- Database-backed game list

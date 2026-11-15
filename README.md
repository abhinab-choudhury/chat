# .Chat

A real-time chat application built with TanStack Start, Convex, and Better Auth.

## Tech Stack

- **Framework:** TanStack Start
- **Real-time Backend & Database:** Convex
- **Authentication & Database:** Better Auth + PostgreSQL
- **Email Testing:** Mailpit
- **Package Manager:** Bun (Node.js runtime for Vite dev server)

## Prerequisites

- [Bun](https://bun.sh)
- [Node.js](https://nodejs.org)
- [Docker](https://docker.com) (running locally)

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

Copy the example environment file and fill in your credentials before running or deploying:

```bash
cp .env.example .env.local
```

### 3. Start local services

Start PostgreSQL and Mailpit (for Better Auth and local email testing):

```bash
docker compose up -d
```

### 4. Start the development servers

Run the web app in your first terminal:

```bash
bun run dev
```

> **Note:** Do not use `bun --bun` or `bun run --parallel`. Both force Bun's runtime and break Vite's dev server with a 10s idle timeout.

In a second terminal, sync your Convex functions and schema:

```bash
bun run dev:convex
```

## Local URLs

- **App:** `http://localhost:3000`
- **Mailpit UI:** `http://localhost:8025`

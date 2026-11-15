Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
bun install

# Start Postgres + Mailpit (Better Auth / email)
docker compose up -d

# Run the web app (Node runtime; do NOT use `bun --bun` or `bun run --parallel`,
# both force Bun's runtime and break Vite's dev server with a 10s idle timeout)
bun run dev

# In a second terminal: sync Convex functions/schema and watch for changes
bun run dev:convex
```


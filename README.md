This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Redis (AI coach)

The AI coach can use a Redis Cloud database. The client is `lib/redis.ts`.

- Set `REDIS_URL=redis://default:<password>@<host>:<port>` in `.env` **and** in
  Vercel → Settings → Environment Variables. Copy it from Redis Cloud → your
  database → Connect. (The Redis Cloud *account* API key is not used.)
- Redis is optional: without `REDIS_URL`, the app runs without it.
- Check the connection: `GET /api/ai/coach/health` → `{"redis":"up"}`,
  `"down"`, or `"not configured"`.

What Redis does for the coach (code in `lib/ai/`, every layer fails open):

| Layer | File | Redis keys |
|---|---|---|
| Knowledge / RAG: past days older than the 7-day window, found by meaning | `rag.ts` | `focusos:day:<date>`, index `focusos:days` |
| Short-term memory: summary of chat turns that no longer fit in the prompt | `memory.ts` | `focusos:session:<date>` (14-day TTL) |
| Long-term memory: durable facts Laww states about himself | `memory.ts` | `focusos:mem:<id>`, index `focusos:mem` |
| Knowledge base: 55 ideas from books, research and philosophy (web-researched by Claude Code, quality-checked by Jev) | `knowledge.ts` | `focusos:kb:<slug>`, index `focusos:kb` |
| LangCache: reuse answers to *general* questions only | `cache.ts` | Redis Cloud LangCache service |

- Embeddings: OpenRouter `qwen/qwen3-embedding-4b` (override with `EMBED_MODEL`;
  changing it rebuilds the indexes).
- `npm run rag:backfill` embeds the whole history once (read-only on Postgres).
  After that, each coach call re-embeds changed recent days in the background.
- Long-term memory: `GET /api/ai/coach/memory` lists facts;
  `DELETE /api/ai/coach/memory?id=<id>` (or `?all=1`) forgets them.
- LangCache needs `LANGCACHE_URL`, `LANGCACHE_CACHE_ID`, `LANGCACHE_API_KEY`
  (Redis Cloud → LangCache → Configuration → Connectivity). Off until all three are set.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

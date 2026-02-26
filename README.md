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

## Required environment

Add a `.env` (and configure the same variables in Vercel) with at least:

```
DATABASE_URL=postgres://...
OPENAI_API_KEY=...
BLOB_READ_WRITE_TOKEN=...
```

The blob token is needed for persistent document uploads. Create a Vercel Blob store and copy the read/write token.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## VERIFY.md

Use this checklist to verify correlation IDs and structured logs locally:

1. Start the app with `npm run dev`.
2. Open the dashboard and send a coach message.
3. In server logs, confirm ordered events exist with the same `requestId`:
   - `api.coach.post.start` / `api.coach.post.end` (or `.error`)
   - `agent.coach.start` / `agent.coach.success` (or `.error`)
   - `openai.start` / `openai.success` (or `openai.timeout` / `openai.error`)
4. Confirm API responses include header `x-request-id` (browser devtools Network tab).
5. Set `OPENAI_STALL_MS=60000` (with default `OPENAI_TIMEOUT_MS=45000`) and trigger a chat/report/prompt refine call; confirm route returns HTTP `504` with `requestId` in JSON and logs contain `openai.timeout`.
6. Repeat for overseer, report generation, and prompt routes (`/api/prompts/*`).

## Session dedupe verification SQL

```sql
SELECT
  "ownerUserId",
  "clientId",
  COUNT(*) AS duplicate_count
FROM "CoachingSession"
GROUP BY "ownerUserId", "clientId"
HAVING COUNT(*) > 1;
```

## Prompt security verification

1. Anonymous `POST /api/prompts/coach` returns `401`.
2. Authenticated non-admin `POST /api/prompts/coach` returns `403`.
3. Authenticated admin `POST /api/prompts/coach` returns `200`.
4. Confirm audit rows exist:

```sql
SELECT *
FROM "PromptAudit"
ORDER BY "createdAt" DESC
LIMIT 5;
```

5. Confirm `GET /api/prompts/{coach|overseer|report}` requires authentication and responses include `x-request-id`.

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
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_TRANSCRIBE_TIMEOUT_MS=45000
TRANSCRIBE_MAX_BYTES=10000000
TRANSCRIBE_MAX_SECONDS=60
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

## Coach SSE streaming verification

1. Start app with `npm run dev`.
2. Open dashboard and send a coach chat message.
3. Confirm the assistant bubble updates incrementally (token-by-token/chunked text), not only at the end.
4. In server logs, confirm events appear for `/api/coach/[clientId]/stream` with the same `requestId`.
5. Temporarily break/disable the stream route and send again; confirm UI falls back to `/api/coach/[clientId]` and shows a fallback toast.

## Client access authz verification

1. Login as Coach A and call `GET /api/clients`; confirm only Coach A clients are returned.
2. Login as Coach A and call `GET /api/clients/{coachBClientId}/documents`; confirm `403`.
3. Login as Coach A and call `POST /api/clients/{coachBClientId}/report`; confirm `403`.
4. Login as Coach A and call `POST /api/coach/{coachBClientId}` (or `/stream`); confirm `403`.
5. Login as Coach A and call `GET /api/clients/{coachAClientId}/documents`; confirm `200`.
6. Login as Admin and repeat steps 2-4 with the same client IDs; confirm `200`.

## Document context verification

1. Upload a PDF to Client A via `POST /api/clients/{clientId}/documents`.
2. Ask coach chat a question that includes a phrase from that PDF.
3. Confirm answer references the phrase and server logs include `doc_context.selected` with:
   - `clientId` of Client A
   - `selectedChunkCount > 0`
   - `totalChars <= DOCUMENT_CONTEXT_BUDGET_CHARS` (or route-specific budget)
4. Set `DEBUG_DOC_CONTEXT=1` and send a coach message:
   - blocking route returns `documentContextSources`
   - stream route `done` event includes `documentContextSources`
5. As Coach B, call `GET /api/clients/{clientAId}/documents`; confirm `403`.
6. Reprocess a document with `POST /api/clients/{clientId}/documents/{documentId}` and confirm extraction metadata updates.
7. Optional DB checks:

```sql
SELECT "id", "clientId", "originalName", "extractionStatus", "extractedAt"
FROM "ClientDocument"
ORDER BY "createdAt" DESC
LIMIT 20;
```

```sql
SELECT "clientId", "documentId", COUNT(*) AS chunk_count
FROM "DocumentChunk"
GROUP BY "clientId", "documentId"
ORDER BY chunk_count DESC
LIMIT 20;
```

### Document debug endpoint (dev only)

- `GET /api/clients/{clientId}/documents/debug` (coach owner or admin only)
- Disabled in production (`404`)
- Returns metadata only (no extracted text):
  - `documentId`, `filename`, `mime`, `size`
  - `hasExtractedText`, `extractedLength`
  - `chunkCount` (or `null` if chunk table/schema is unavailable)
  - `extractionStatus`, `extractionError`
  - `updatedAt`

### Debug response metadata

When `DEBUG_DOC_CONTEXT=1`, coach/report responses include:

- `documentContextSources`
- `docContext`:
  - `docsConsidered`
  - `chunksSelected`
  - `totalChars`
  - `sources`

For streaming, this appears in the `done` SSE event payload.

## Auth debugging

Enable debug mode locally:

```bash
AUTH_DEBUG=1
NEXT_PUBLIC_AUTH_DEBUG=1
```

Restart the app after changing env vars.

### Debug endpoint

- Development only: `GET /api/auth/debug`
- Production (`next start`) intentionally returns `404`.

Response shape:

- `hasSession`
- `userId`
- `cookieNames` (names only, never values)
- `timestamp`
- `authDebugEnabled`

### Logs to check

1. Auth route lifecycle (server):
   - `auth.route.start`
   - `auth.route.end`
   - `auth.route.error`
2. Session reads (server):
   - `auth.session.read`
   - `auth.session.read.error`
3. Client auth actions (browser console):
   - `auth.client.signin.start` / `auth.client.signin.end`
   - `auth.client.signout.start` / `auth.client.signout.end`

Each event includes `requestId` so you can correlate client and server actions.

### Common symptoms and checks

1. Sign-out appears to succeed but user still seems logged in:
   - Check `auth.client.signout.end` and `auth.route.end` for same `requestId`.
   - Confirm `auth.route.end` shows `hasSetCookie: true` and cookie names include auth cookies.
   - Confirm subsequent protected API call returns `401`.
2. Sign-in requires refresh:
   - Check `auth.client.signin.end` has success status.
   - Check `auth.session.read` right after sign-in returns `hasSession: true`.
   - Ensure app and auth endpoints are served from the same origin in local dev.
3. UI session looks stale:
   - Confirm client calls trigger `router.refresh()`.
   - Confirm API responses are `Cache-Control: no-store`.

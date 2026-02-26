import { PrismaClient } from "@prisma/client";

interface SessionAggregateRow {
  id: string;
  clientId: string;
  ownerUserId: string | null;
  updatedAt: Date;
  messageCount: number | bigint | string;
}

const prisma = new PrismaClient();

function normalizeCount(value: number | bigint | string) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return Number(value);
}

function sortByCanonicalPriority(a: SessionAggregateRow, b: SessionAggregateRow) {
  const aCount = normalizeCount(a.messageCount);
  const bCount = normalizeCount(b.messageCount);
  if (aCount !== bCount) {
    return bCount - aCount;
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

async function resolveFallbackOwnerUserId() {
  const adminRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "role" = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1
  `;

  if (adminRows[0]?.id) {
    return adminRows[0].id;
  }

  const userRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    ORDER BY "createdAt" ASC
    LIMIT 1
  `;

  return userRows[0]?.id ?? null;
}

async function backfillMissingOwnerUserIds(fallbackOwnerUserId: string | null) {
  const fromClientCoach = await prisma.$executeRaw`
    UPDATE "CoachingSession" AS cs
    SET "ownerUserId" = c."coachId"
    FROM "Client" AS c
    WHERE cs."clientId" = c."id"
      AND cs."ownerUserId" IS NULL
      AND c."coachId" IS NOT NULL
  `;

  let fromFallback = 0;
  if (fallbackOwnerUserId) {
    fromFallback = await prisma.$executeRaw`
      UPDATE "CoachingSession"
      SET "ownerUserId" = ${fallbackOwnerUserId}
      WHERE "ownerUserId" IS NULL
    `;
  }

  const remainingNullRows = await prisma.$queryRaw<Array<{ count: number | bigint | string }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "CoachingSession"
    WHERE "ownerUserId" IS NULL
  `;
  const remainingNullCount = normalizeCount(remainingNullRows[0]?.count ?? 0);
  if (remainingNullCount > 0) {
    throw new Error(
      `Cannot resolve ownerUserId for ${remainingNullCount} coaching sessions.`,
    );
  }

  return {
    fromClientCoach: Number(fromClientCoach),
    fromFallback: Number(fromFallback),
  };
}

async function fetchSessionAggregates() {
  return prisma.$queryRaw<SessionAggregateRow[]>`
    SELECT
      cs."id",
      cs."clientId",
      cs."ownerUserId",
      cs."updatedAt",
      COUNT(am."id")::bigint AS "messageCount"
    FROM "CoachingSession" AS cs
    LEFT JOIN "AgentMessage" AS am ON am."sessionId" = cs."id"
    GROUP BY cs."id", cs."clientId", cs."ownerUserId", cs."updatedAt"
  `;
}

async function dedupeSessions() {
  const sessionRows = await fetchSessionAggregates();
  const sessionsByOwnerClient = new Map<string, SessionAggregateRow[]>();

  for (const session of sessionRows) {
    const ownerUserId = session.ownerUserId;
    if (!ownerUserId) {
      throw new Error(`Session ${session.id} has no ownerUserId after backfill.`);
    }
    const key = `${ownerUserId}:${session.clientId}`;
    const existing = sessionsByOwnerClient.get(key) ?? [];
    existing.push(session);
    sessionsByOwnerClient.set(key, existing);
  }

  let duplicateGroupCount = 0;
  let removedSessionCount = 0;
  let movedMessageCount = 0;

  for (const [, group] of sessionsByOwnerClient) {
    if (group.length <= 1) {
      continue;
    }

    duplicateGroupCount += 1;
    const sorted = [...group].sort(sortByCanonicalPriority);
    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    await prisma.$transaction(async (tx) => {
      for (const duplicate of duplicates) {
        const movedRows = await tx.$executeRaw`
          UPDATE "AgentMessage"
          SET "sessionId" = ${canonical.id}
          WHERE "sessionId" = ${duplicate.id}
        `;
        movedMessageCount += Number(movedRows);

        await tx.$executeRaw`
          DELETE FROM "CoachingSession"
          WHERE "id" = ${duplicate.id}
        `;
        removedSessionCount += 1;
      }
    });
  }

  const duplicatesRemaining = await prisma.$queryRaw<
    Array<{ count: number | bigint | string }>
  >`
    SELECT COUNT(*)::bigint AS count
    FROM (
      SELECT "ownerUserId", "clientId", COUNT(*) AS duplicate_count
      FROM "CoachingSession"
      GROUP BY "ownerUserId", "clientId"
      HAVING COUNT(*) > 1
    ) AS duplicates
  `;

  const duplicateRowsRemaining = normalizeCount(duplicatesRemaining[0]?.count ?? 0);
  if (duplicateRowsRemaining > 0) {
    throw new Error(
      `Deduplication failed: ${duplicateRowsRemaining} duplicate owner/client groups remain.`,
    );
  }

  return {
    duplicateGroupCount,
    removedSessionCount,
    movedMessageCount,
  };
}

async function main() {
  const fallbackOwnerUserId = await resolveFallbackOwnerUserId();
  const backfillStats = await backfillMissingOwnerUserIds(fallbackOwnerUserId);
  const dedupeStats = await dedupeSessions();

  console.log("dedupe-coaching-sessions complete");
  console.log(
    JSON.stringify(
      {
        fallbackOwnerUserId,
        ...backfillStats,
        ...dedupeStats,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

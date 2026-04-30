import { prisma } from "@/lib/prisma";

export interface ClientReport {
  id: string;
  content: string;
  createdAt: string;
}

export async function getLatestClientReport(
  clientId: string
): Promise<ClientReport | null> {
  const report = await prisma.clientReport.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  if (!report) {
    return null;
  }
  return {
    id: report.id,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  };
}

export async function listClientReports(
  clientId: string,
  limit = 5
): Promise<ClientReport[]> {
  const reports = await prisma.clientReport.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return reports.map((report) => ({
    id: report.id,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  }));
}

export async function saveClientReport(
  clientId: string,
  content: string
): Promise<ClientReport> {
  const report = await prisma.clientReport.create({
    data: {
      clientId,
      content,
    },
  });
  return {
    id: report.id,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  };
}

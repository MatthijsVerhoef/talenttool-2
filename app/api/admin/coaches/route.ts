import { SessionGuardError, requireAdminSession } from "@/lib/auth-guards";
import { listCoaches } from "@/lib/data/users";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const coaches = await listCoaches();
    return jsonWithRequestId(session.requestId, { coaches });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    throw error;
  }
}

import { SessionGuardError, requireAdminSession } from "@/lib/auth-guards";
import { revokePendingInvite } from "@/lib/data/users";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

interface RouteParams {
  params: Promise<{
    inviteId: string;
  }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const { inviteId } = await params;

    if (!inviteId) {
      return jsonWithRequestId(session.requestId, { error: "Uitnodiging ontbreekt." }, { status: 400 });
    }

    const revoked = await revokePendingInvite(inviteId);
    if (!revoked) {
      return jsonWithRequestId(
        session.requestId,
        { error: "Uitnodiging niet gevonden of al geaccepteerd." },
        { status: 404 }
      );
    }

    return jsonWithRequestId(session.requestId, { success: true });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    console.error("Invite revoke failed", error);
    return jsonWithRequestId(requestId, { error: "Uitnodiging intrekken is mislukt." }, { status: 500 });
  }
}

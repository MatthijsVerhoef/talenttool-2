const RESEND_API_URL = "https://api.resend.com/emails";

function extractResendErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const directMessage = (payload as { message?: unknown }).message;
  if (typeof directMessage === "string" && directMessage.trim().length > 0) {
    return directMessage.trim();
  }

  const nestedError = (payload as { error?: unknown }).error;
  if (nestedError && typeof nestedError === "object") {
    const nestedMessage = (nestedError as { message?: unknown }).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
      return nestedMessage.trim();
    }
  }

  return "";
}

export async function sendUserInviteEmail(input: {
  toEmail: string;
  inviteUrl: string;
  inviterName?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY ontbreekt.");
  }

  const fromEmail = process.env.INVITE_FROM_EMAIL?.trim();
  if (!fromEmail) {
    throw new Error("INVITE_FROM_EMAIL ontbreekt.");
  }

  const appName = process.env.APP_NAME?.trim() || "TalentTool";
  const fromName = process.env.INVITE_FROM_NAME?.trim() || appName;
  const from = fromEmail.includes("<")
    ? fromEmail
    : `${fromName} <${fromEmail}>`;

  const inviter = input.inviterName?.trim() || "Een beheerder";
  const subject = `Je bent uitgenodigd voor ${appName}`;
  const text = [
    `Hoi,`,
    "",
    `${inviter} heeft je uitgenodigd voor ${appName}.`,
    "",
    "Gebruik deze link om je account aan te maken:",
    input.inviteUrl,
    "",
    "Als je deze uitnodiging niet verwachtte, kun je deze e-mail negeren.",
  ].join("\n");

  const html = [
    `<p>Hoi,</p>`,
    `<p>${inviter} heeft je uitgenodigd voor <strong>${appName}</strong>.</p>`,
    `<p><a href="${input.inviteUrl}">Klik hier om je account aan te maken</a></p>`,
    `<p>Als je deze uitnodiging niet verwachtte, kun je deze e-mail negeren.</p>`,
  ].join("");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.toEmail],
      subject,
      text,
      html,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const resendMessage = extractResendErrorMessage(payload);
    throw new Error(
      resendMessage ||
        `Uitnodigingsmail kon niet worden verzonden via Resend (status ${response.status}).`
    );
  }
}

import { NextResponse } from "next/server";
import { APIError } from "better-auth";

import { auth } from "@/lib/auth";
import {
  findActiveInviteByToken,
  markInviteAccepted,
} from "@/lib/data/users";

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  if (!token) {
    return NextResponse.json({ error: "Uitnodiging ontbreekt" }, { status: 400 });
  }

  const invite = await findActiveInviteByToken(token);

  if (!invite) {
    return NextResponse.json(
      { error: "Uitnodiging is verlopen of bestaat niet." },
      { status: 404 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { name, password } = payload as {
    name?: string;
    password?: string;
  };

  if (!name?.trim() || !password?.trim()) {
    return NextResponse.json(
      { error: "Naam en wachtwoord zijn verplicht." },
      { status: 400 }
    );
  }

  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: name.trim(),
        email: invite.email,
        password: password.trim(),
      },
      headers: request.headers,
      returnHeaders: true,
      returnStatus: true,
    });

    const createdUser = signUpResult.response.user;

    await markInviteAccepted(invite.id, createdUser.id);

    const response = NextResponse.json(
      { user: createdUser, invite },
      { status: 201 }
    );

    if (signUpResult.headers) {
      signUpResult.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          response.headers.append(key, value);
        } else {
          response.headers.set(key, value);
        }
      });
    }

    return response;
  } catch (error) {
    const status =
      error instanceof APIError
        ? Number(error.statusCode) || 400
        : 400;
    const message =
      error instanceof Error
        ? error.message
        : "Registreren via uitnodiging is mislukt.";

    return NextResponse.json({ error: message }, { status });
  }
}

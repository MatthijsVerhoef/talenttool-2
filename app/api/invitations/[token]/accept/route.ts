import { NextResponse } from "next/server";
import { APIError } from "better-auth";

import { auth } from "@/lib/auth";
import { deleteFromBlob, uploadToBlob } from "@/lib/blob";
import {
  findActiveInviteByToken,
  markInviteAccepted,
  updateUserProfile,
} from "@/lib/data/users";
import { normalizeUserName } from "@/lib/user-name";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
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

  const contentType = request.headers.get("content-type") ?? "";
  let name: string | undefined;
  let firstName: string | undefined;
  let lastName: string | undefined;
  let password: string | undefined;
  let companyName: string | undefined;
  let companyLogoFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
    }

    name = formData.get("name")?.toString();
    firstName = formData.get("firstName")?.toString();
    lastName = formData.get("lastName")?.toString();
    password = formData.get("password")?.toString();
    companyName = formData.get("companyName")?.toString();

    const logoEntry = formData.get("companyLogo");
    companyLogoFile = logoEntry instanceof File && logoEntry.size > 0 ? logoEntry : null;
  } else {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
    }

    const parsedPayload = payload as {
      name?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
      companyName?: string;
    };

    name = parsedPayload.name;
    firstName = parsedPayload.firstName;
    lastName = parsedPayload.lastName;
    password = parsedPayload.password;
    companyName = parsedPayload.companyName;
  }

  const normalizedName = normalizeUserName({
    name,
    firstName,
    lastName,
  });
  const normalizedCompanyName = companyName?.trim() ?? "";

  if (!normalizedName || !password?.trim()) {
    return NextResponse.json(
      { error: "Naam en wachtwoord zijn verplicht." },
      { status: 400 }
    );
  }

  if (invite.role === "COACH" && !normalizedCompanyName) {
    return NextResponse.json(
      { error: "Bedrijfsnaam is verplicht." },
      { status: 400 }
    );
  }

  let companyLogoUrl: string | undefined;

  try {
    if (companyLogoFile) {
      const storedName = `${Date.now()}-${companyLogoFile.name.replace(/\s+/g, "_")}`;
      const blob = await uploadToBlob(
        `company-logos/${invite.id}-${storedName}`,
        companyLogoFile,
        companyLogoFile.type || "application/octet-stream"
      );
      companyLogoUrl = blob.url;
    }

    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: normalizedName,
        email: invite.email,
        password: password.trim(),
      },
      headers: request.headers,
      returnHeaders: true,
      returnStatus: true,
    });

    const createdUser = signUpResult.response.user;

    if (normalizedCompanyName || companyLogoUrl) {
      await updateUserProfile(createdUser.id, {
        ...(normalizedCompanyName
          ? { companyName: normalizedCompanyName }
          : {}),
        ...(companyLogoUrl ? { companyLogoUrl } : {}),
      });
    }

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
    if (companyLogoUrl) {
      await deleteFromBlob(companyLogoUrl).catch(() => undefined);
    }

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

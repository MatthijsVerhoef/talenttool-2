export interface UserNameParts {
  firstName: string;
  lastName: string;
}

function normalizeNamePart(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function splitUserName(name?: string | null): UserNameParts {
  const normalizedName = normalizeNamePart(name);

  if (!normalizedName) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = normalizedName.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function joinUserName(
  firstName?: string | null,
  lastName?: string | null
) {
  return [normalizeNamePart(firstName), normalizeNamePart(lastName)]
    .filter(Boolean)
    .join(" ");
}

export function normalizeUserName(input: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const hasSplitNameInput =
    typeof input.firstName === "string" || typeof input.lastName === "string";

  if (hasSplitNameInput) {
    return joinUserName(input.firstName, input.lastName);
  }

  return normalizeNamePart(input.name);
}

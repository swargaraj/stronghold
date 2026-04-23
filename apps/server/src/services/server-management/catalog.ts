import { cachedFetcher } from "@/lib/cachedFetcher";

const MOJANG_VERSION_MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest.json";
const PAPER_PROJECT_API_URL = "https://api.papermc.io/v2/projects/paper";

export const serverPlatformOptions = ["JAVA"] as const;
export const javaSoftwareOptions = ["VANILLA", "PAPER"] as const;

export type ServerPlatform = (typeof serverPlatformOptions)[number];
export type JavaSoftware = (typeof javaSoftwareOptions)[number];

export type SoftwareType = JavaSoftware;

type MojangVersionManifest = {
  versions: Array<{
    id: string;
    type: "release" | "snapshot";
  }>;
};

type PaperProjectResponse = {
  versions: string[];
};

const getMojangManifest = cachedFetcher(
  async (): Promise<MojangVersionManifest> => {
    const res = await fetch(MOJANG_VERSION_MANIFEST_URL, {
      headers: { accept: "application/json" },
    });
    if (!res.ok)
      throw new Error(
        `Failed to fetch ${MOJANG_VERSION_MANIFEST_URL}: ${res.status}`,
      );
    const data = (await res.json()) as MojangVersionManifest;
    return data;
  },
);

const getPaperVersions = cachedFetcher(async (): Promise<string[]> => {
  const res = await fetch(PAPER_PROJECT_API_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok)
    throw new Error(`Failed to fetch ${PAPER_PROJECT_API_URL}: ${res.status}`);

  const data: PaperProjectResponse = (await res.json()) as PaperProjectResponse;

  return data.versions.sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  );
});

export function resolveServerType(input: {
  serverPlatform?: ServerPlatform;
  softwareType?: SoftwareType;
  serverType?: string;
}): string {
  return input.serverType ?? input.softwareType ?? "VANILLA";
}

export function deriveServerSelection(serverType: string) {
  return {
    serverPlatform: "JAVA" as const,
    softwareType: (serverType === "PAPER"
      ? "PAPER"
      : "VANILLA") as JavaSoftware,
  };
}

export function listSoftware(): JavaSoftware[] {
  return [...javaSoftwareOptions];
}

export function isSupportedSoftware(softwareType: string): boolean {
  return javaSoftwareOptions.includes(softwareType as JavaSoftware);
}

export async function listVersions(softwareType: string): Promise<string[]> {
  const upper = softwareType.toUpperCase();

  if (upper === "PAPER") {
    return getPaperVersions();
  }

  if (upper === "VANILLA") {
    const manifest = await getMojangManifest();
    return manifest.versions.map((v) => v.id);
  }

  throw new Error(`Unsupported software: ${softwareType}`);
}

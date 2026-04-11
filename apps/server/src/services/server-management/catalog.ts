const MOJANG_VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest.json";
const PAPER_PROJECT_API_URL = "https://api.papermc.io/v2/projects/paper";
const DOCKER_HUB_API_URL = "https://registry.hub.docker.com/v2/repositories";

export const serverPlatformOptions = ["JAVA", "BEDROCK"] as const;
export const javaSoftwareOptions = ["VANILLA", "PAPER"] as const;
export const bedrockSoftwareOptions = ["VANILLA"] as const;
export const versionTypeOptions = ["RELEASE", "SNAPSHOT"] as const;

export type ServerPlatform = (typeof serverPlatformOptions)[number];
export type JavaSoftware = (typeof javaSoftwareOptions)[number];
export type BedrockSoftware = (typeof bedrockSoftwareOptions)[number];
export type SoftwareType = JavaSoftware | BedrockSoftware;
export type VersionType = (typeof versionTypeOptions)[number];
type JavaVersionManifestType = MojangVersionManifest["versions"][number]["type"];

type MojangVersionManifest = {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: Array<{
    id: string;
    type: "release" | "snapshot" | "old_beta" | "old_alpha";
    url: string;
    time: string;
    releaseTime: string;
  }>;
};

type PaperProjectResponse = {
  project_id: string;
  project_name: string;
  version_groups: string[];
  versions: string[];
};

type DockerHubTagsResponse = {
  next: string | null;
  results: Array<{
    name: string;
  }>;
};

export function resolveServerType(input: {
  serverPlatform?: ServerPlatform;
  softwareType?: SoftwareType;
  serverType?: string;
}) {
  if (input.serverType) {
    return input.serverType;
  }

  if (input.serverPlatform === "BEDROCK") {
    return "BEDROCK";
  }

  return input.softwareType ?? "VANILLA";
}

export function deriveServerSelection(serverType: string) {
  if (serverType === "BEDROCK") {
    return {
      serverPlatform: "BEDROCK" as const,
      softwareType: "VANILLA" as const,
    };
  }

  return {
    serverPlatform: "JAVA" as const,
    softwareType: serverType === "PAPER" ? ("PAPER" as const) : ("VANILLA" as const),
  };
}

export function listSoftware(serverPlatform?: string) {
  if (serverPlatform === "BEDROCK") {
    return [...bedrockSoftwareOptions];
  }

  return [...javaSoftwareOptions];
}

export function isSupportedServerPlatform(value: string): value is ServerPlatform {
  return serverPlatformOptions.includes(value as ServerPlatform);
}

export function isSupportedVersionType(value: string): value is VersionType {
  return versionTypeOptions.includes(value as VersionType);
}

export function isSupportedSoftware(serverPlatform: ServerPlatform, softwareType: string) {
  return listSoftware(serverPlatform).includes(softwareType as SoftwareType);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function isVersionLikeTag(value: string) {
  return /^\d+(?:\.\d+){1,3}(?:\.\d+)?$/.test(value);
}

function compareVersionStrings(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }

  return 0;
}

async function getMojangManifest() {
  return fetchJson<MojangVersionManifest>(MOJANG_VERSION_MANIFEST_URL);
}

async function getJavaVersions(versionType: JavaVersionManifestType) {
  const manifest = await getMojangManifest();
  return manifest.versions
    .filter((version) => version.type === versionType)
    .map((version) => version.id);
}

async function getPaperVersions() {
  const response = await fetchJson<PaperProjectResponse>(PAPER_PROJECT_API_URL);
  return response.versions.sort(compareVersionStrings);
}

async function listDockerHubTags(namespace: string, repository: string) {
  const tags: string[] = [];
  let nextUrl = `${DOCKER_HUB_API_URL}/${namespace}/${repository}/tags?page_size=100`;

  while (nextUrl) {
    const response = await fetchJson<DockerHubTagsResponse>(nextUrl);
    tags.push(...response.results.map((result) => result.name));
    nextUrl = response.next ?? "";
  }

  return tags;
}

async function getBedrockVersions() {
  return (await listDockerHubTags("itzg", "minecraft-bedrock-server"))
    .filter((tag) => isVersionLikeTag(tag))
    .sort(compareVersionStrings)
    .filter((value, index, collection) => collection.indexOf(value) === index);
}

function assertReleaseVersionType(versionType?: string) {
  if (versionType && versionType !== "RELEASE") {
    throw new Error("Unsupported versionType");
  }
}

export async function listVersions(serverPlatform: string | undefined, softwareType: string, versionType?: string) {
  if (serverPlatform === "BEDROCK") {
    if (softwareType !== "VANILLA") {
      throw new Error("Unsupported software");
    }

    assertReleaseVersionType(versionType);
    return getBedrockVersions();
  }

  if (softwareType === "PAPER") {
    assertReleaseVersionType(versionType);
    return getPaperVersions();
  }

  if (softwareType !== "VANILLA") {
    throw new Error("Unsupported software");
  }

  if (versionType === "SNAPSHOT") {
    return getJavaVersions("snapshot");
  }

  assertReleaseVersionType(versionType);
  return getJavaVersions("release");
}

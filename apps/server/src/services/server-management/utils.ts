import type { ApiServer, Server, ServerStatus } from "./types";
import { DockerCommandError } from "../docker";
import { deriveServerSelection } from "./catalog";
import { extraEnvSchema, portsSchema, type PortMapping } from "./schemas";

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "server"
  );
}

export function createId() {
  return crypto.randomUUID();
}

export function generateSecret(length = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function parseExtraEnv(value: string) {
  const parsed: unknown = JSON.parse(value);
  return extraEnvSchema.parse(parsed);
}

export function serializeExtraEnv(value: Record<string, string>) {
  return JSON.stringify(value);
}

export function getPrimaryPortMapping(server: Pick<Server, "hostPort" | "containerPort">) {
  return {
    hostPort: server.hostPort,
    containerPort: server.containerPort,
    protocol: "tcp" as const,
    exposure: "public" as const,
  };
}

export function parsePorts(
  value: string,
  fallback: Pick<Server, "hostPort" | "containerPort">,
): PortMapping[] {
  const parsed: unknown = JSON.parse(value);

  if (Array.isArray(parsed) && parsed.length === 0) {
    return [getPrimaryPortMapping(fallback)];
  }

  return portsSchema.parse(parsed);
}

export function serializePorts(value: PortMapping[]) {
  return JSON.stringify(portsSchema.parse(value));
}

export function toApiServer(server: Server): ApiServer {
  const { extraEnvJson: _extraEnvJson, portsJson: _portsJson, ...rest } = server;

  return {
    ...rest,
    extraEnv: parseExtraEnv(server.extraEnvJson),
    ports: parsePorts(server.portsJson, server),
    ...deriveServerSelection(server.serverType),
  };
}

export function isPendingStatus(status: ServerStatus) {
  return ["creating", "starting", "stopping", "restarting", "killing", "deleting"].includes(status);
}

export function runBackground(task: () => Promise<void>) {
  void task().catch((error) => {
    console.error(error);
  });
}

export function dockerNotFound(error: unknown) {
  return error instanceof DockerCommandError && /No such object|not found/i.test(error.stderr);
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof DockerCommandError) {
    return error.stderr || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function dockerBoolean(value: boolean) {
  return value ? "TRUE" : "FALSE";
}

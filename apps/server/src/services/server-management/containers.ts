import { TRPCError } from "@trpc/server";

import { DockerCommandError, runDocker } from "../docker";
import { setServerContainerCreated, setServerStatus } from "./repository";
import type { DockerState, Server, ServerStatus } from "./types";
import { dockerBoolean, dockerNotFound, parseExtraEnv, parsePorts } from "./utils";

function dockerUnavailable(error: unknown): never {
  if (error instanceof DockerCommandError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.stderr || error.message,
    });
  }

  throw error;
}

function buildContainerArgs(server: Server) {
  const ports = parsePorts(server.portsJson, server);
  const [primaryPort] = ports;
  const env = {
    EULA: "TRUE",
    MEMORY: server.memory,
    TYPE: server.serverType,
    VERSION: server.minecraftVersion,
    MOTD: server.motd,
    MAX_PLAYERS: String(server.maxPlayers),
    DIFFICULTY: server.difficulty,
    MODE: server.gameMode,
    ONLINE_MODE: dockerBoolean(server.onlineMode),
    SERVER_PORT: String(primaryPort?.containerPort ?? server.containerPort),
    ENABLE_RCON: "TRUE",
    RCON_PASSWORD: server.rconPassword,
    ...parseExtraEnv(server.extraEnvJson),
  };

  const args = ["create", "--name", server.containerName, "-v", `${server.volumeName}:/data`];

  for (const mapping of ports) {
    if (mapping.exposure === "internal" || mapping.hostPort === undefined) {
      continue;
    }

    const publishedPort =
      mapping.exposure === "localhost"
        ? `127.0.0.1:${mapping.hostPort}:${mapping.containerPort}/${mapping.protocol}`
        : `${mapping.hostPort}:${mapping.containerPort}/${mapping.protocol}`;

    args.push("-p", publishedPort);
  }

  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }

  args.push(server.image);
  return args;
}

export function toServerStatus(state: DockerState): ServerStatus {
  if (state.Running) {
    return "running";
  }

  if (state.Status === "exited" || state.Status === "created") {
    return "stopped";
  }

  if (state.Status === "restarting") {
    return "restarting";
  }

  return "stopped";
}

export async function createContainer(server: Server) {
  await setServerStatus(server.id, "creating");
  const result = await runDocker(buildContainerArgs(server));
  return setServerContainerCreated(server, result.stdout);
}

export async function inspectContainer(server: Server) {
  const result = await runDocker(["inspect", "--format", "{{json .State}}", server.containerId ?? server.containerName]);
  return JSON.parse(result.stdout) as DockerState;
}

export async function runContainerAction(server: Server, action: "start" | "stop" | "restart" | "kill") {
  await runDocker([action, server.containerId ?? server.containerName]);
}

export async function removeContainer(server: Server, removeVolume: boolean) {
  try {
    await runDocker(["rm", "-f", server.containerId ?? server.containerName]);
  } catch (error) {
    if (!dockerNotFound(error)) {
      dockerUnavailable(error);
    }
  }

  if (removeVolume) {
    try {
      await runDocker(["volume", "rm", server.volumeName]);
    } catch (error) {
      if (!dockerNotFound(error)) {
        dockerUnavailable(error);
      }
    }
  }
}

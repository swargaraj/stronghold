import { DockerCommandError, runDocker } from "../docker";
import type { Server } from "./types";

type DockerStatsPayload = {
  BlockIO?: string;
  CPUPerc?: string;
  MemPerc?: string;
  MemUsage?: string;
  NetIO?: string;
};

type DockerInspectPayload = {
  Id?: string;
  Image?: string;
  Name?: string;
  SizeRootFs?: number;
  SizeRw?: number;
};

const sizeUnits: Record<string, number> = {
  B: 1,
  KB: 1000,
  KIB: 1024,
  MB: 1000 ** 2,
  MIB: 1024 ** 2,
  GB: 1000 ** 3,
  GIB: 1024 ** 3,
};

function parsePercent(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseSize(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = /([\d.]+)\s*([KMGT]?i?B|B)/i.exec(value.trim());

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier = sizeUnits[unit];

  if (!Number.isFinite(amount) || !multiplier) {
    return null;
  }

  return Math.round(amount * multiplier);
}

function parsePair(value: string | undefined) {
  if (!value) {
    return [null, null] as const;
  }

  const [left, right] = value.split("/").map((part) => parseSize(part));
  return [left ?? null, right ?? null] as const;
}

function dockerStatsUnavailable(error: unknown) {
  return error instanceof DockerCommandError;
}

async function getPlayersOnline(server: Server) {
  try {
    const result = await runDocker([
      "exec",
      server.containerId ?? server.containerName,
      "rcon-cli",
      "list",
    ]);
    const match = /There are (\d+) of a max/i.exec(result.stdout);
    const playersOnline = match?.[1] ? Number(match[1]) : null;
    const namesText = result.stdout.includes(":")
      ? result.stdout.split(":").slice(1).join(":").trim()
      : "";
    const playerNames = namesText
      ? namesText
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];

    return {
      playerNamesJson: JSON.stringify(playerNames),
      playersOnline,
    };
  } catch (error) {
    if (dockerStatsUnavailable(error)) {
      return {
        playerNamesJson: "[]",
        playersOnline: null,
      };
    }

    throw error;
  }
}

export async function collectDockerStats(server: Server) {
  try {
    const [result, playerState] = await Promise.all([
      runDocker([
        "stats",
        "--no-stream",
        "--format",
        "{{json .}}",
        server.containerId ?? server.containerName,
      ]),
      getPlayersOnline(server),
    ]);
    const stats = JSON.parse(result.stdout) as DockerStatsPayload;
    const inspectResult = await runDocker([
      "inspect",
      "--size",
      "--format",
      "{{json .}}",
      server.containerId ?? server.containerName,
    ]);
    const inspect = JSON.parse(inspectResult.stdout) as DockerInspectPayload;
    const [memoryUsageBytes, memoryLimitBytes] = parsePair(stats.MemUsage);
    const [networkRxBytes, networkTxBytes] = parsePair(stats.NetIO);
    const [blockReadBytes, blockWriteBytes] = parsePair(stats.BlockIO);

    return {
      blockReadBytes,
      blockWriteBytes,
      cpuPercent: parsePercent(stats.CPUPerc),
      diskUsageBytes: inspect.SizeRw ?? null,
      memoryLimitBytes,
      memoryPercent: parsePercent(stats.MemPerc),
      memoryUsageBytes,
      networkRxBytes,
      networkTxBytes,
      playerNamesJson: playerState.playerNamesJson,
      playersOnline: playerState.playersOnline,
    };
  } catch (error) {
    if (dockerStatsUnavailable(error)) {
      return {
        blockReadBytes: null,
        blockWriteBytes: null,
        cpuPercent: null,
        diskUsageBytes: null,
        memoryLimitBytes: null,
        memoryPercent: null,
        memoryUsageBytes: null,
        networkRxBytes: null,
        networkTxBytes: null,
        playerNamesJson: "[]",
        playersOnline: null,
      };
    }

    throw error;
  }
}

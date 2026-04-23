import { getServerRow, listServerStats } from "./repository";
import { collectDockerStats } from "./docker-stats";
import { getMinecraftLogSnapshot } from "./logs";
import type { ServerStatsHistoryInput } from "./schemas";
import { reconcileServerOrThrow } from "./sync";
import { parsePorts, toApiServer } from "./utils";

const defaultStatsLimit = 100;

export async function getServerDetails(id: string) {
  const server = await getServerRow(id);
  const reconciled = await reconcileServerOrThrow(server);
  const currentStats =
    reconciled.status === "running"
      ? {
          ...(await collectDockerStats(reconciled)),
          recordedAt: new Date(),
        }
      : null;
  const history = await listServerStats(reconciled.id, defaultStatsLimit);
  const logs = await getMinecraftLogSnapshot(reconciled);
  const minecraftStatus =
    logs.status === "starting" &&
    reconciled.status === "running" &&
    currentStats?.playersOnline !== null
      ? "ready"
      : logs.status;
  const ports = parsePorts(reconciled.portsJson, reconciled);

  return {
    server: toApiServer(reconciled),
    currentStats,
    history,
    runtime: {
      containerId: reconciled.containerId,
      containerName: reconciled.containerName,
      image: reconciled.image,
      volumeName: reconciled.volumeName,
    },
    minecraft: {
      difficulty: reconciled.difficulty,
      gameMode: reconciled.gameMode,
      maxPlayers: reconciled.maxPlayers,
      memory: reconciled.memory,
      motd: reconciled.motd,
      onlineMode: reconciled.onlineMode,
      port: ports[0]?.hostPort ?? reconciled.hostPort,
      ports,
      ready: minecraftStatus === "ready",
      serverType: reconciled.serverType,
      status: minecraftStatus,
      version: reconciled.minecraftVersion,
    },
  };
}

export async function getServerStatsHistory(input: ServerStatsHistoryInput) {
  await getServerRow(input.id);
  return listServerStats(input.id, input.limit);
}

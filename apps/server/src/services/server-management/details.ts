import { getServerRow, listServerStats } from "./repository";
import type { ServerStatsHistoryInput } from "./schemas";
import { reconcileServerOrThrow } from "./sync";
import { parsePorts, toApiServer } from "./utils";

const defaultStatsLimit = 100;

async function getLatestServerStats(serverId: string) {
  const [latest] = await listServerStats(serverId, 1);
  return latest ?? null;
}

export async function getServerDetails(id: string) {
  const server = await getServerRow(id);
  const reconciled = await reconcileServerOrThrow(server);
  const currentStats = await getLatestServerStats(reconciled.id);
  const history = await listServerStats(reconciled.id, defaultStatsLimit);
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
      serverType: reconciled.serverType,
      version: reconciled.minecraftVersion,
    },
  };
}

export async function getServerStatsHistory(input: ServerStatsHistoryInput) {
  await getServerRow(input.id);
  return listServerStats(input.id, input.limit);
}

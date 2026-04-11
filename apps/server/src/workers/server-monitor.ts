import {
  insertServerStatsSnapshot,
  listServerRows,
  pruneServerStatsOlderThan,
} from "@/services/server-management/repository";
import { collectDockerStats } from "@/services/server-management/docker-stats";
import { reconcileServer } from "@/services/server-management/sync";
import type { Server } from "@/services/server-management/types";

const monitorIntervalMs = 30_000;
const statsRetentionMs = 7 * 24 * 60 * 60 * 1000;

let monitorTimer: Timer | undefined;
let isCollecting = false;

function isRunningServer(server: Server | null): server is Server {
  return server?.status === "running";
}

async function collectServerSnapshot() {
  if (isCollecting) {
    return;
  }

  isCollecting = true;

  try {
    const rows = await listServerRows();
    const reconciled = await Promise.all(rows.map((server) => reconcileServer(server)));
    const activeServers = reconciled.filter(isRunningServer);

    await Promise.all(
      activeServers.map(async (server) => {
        const stats = await collectDockerStats(server);
        await insertServerStatsSnapshot({
          serverId: server.id,
          ...stats,
        });
      }),
    );

    await pruneServerStatsOlderThan(new Date(Date.now() - statsRetentionMs));
  } catch (error) {
    console.error("Server monitor failed", error);
  } finally {
    isCollecting = false;
  }
}

export function startServerMonitor() {
  if (monitorTimer) {
    return;
  }

  void collectServerSnapshot();
  monitorTimer = setInterval(() => {
    void collectServerSnapshot();
  }, monitorIntervalMs);
}

import {
  insertServerStatsSnapshot,
  listServerRows,
  pruneServerStatsOlderThan,
} from "@/services/server-management/repository";
import { collectDockerStats } from "@/services/server-management/docker-stats";
import { reconcileServer } from "@/services/server-management/sync";
import type { Server } from "@/services/server-management/types";
import { logger } from "@/lib/logger";
import { env } from "@stronghold/env/server";

let monitorTimer: Timer | undefined;
let isCollecting = false;

function isRunningServer(server: Server | null): server is Server {
  return server?.status === "running";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ]);
}

async function collectServerSnapshot() {
  if (isCollecting) {
    logger.warn("Server monitor skipped (previous run still active)");
    return;
  }

  isCollecting = true;

  try {
    const rows = await listServerRows();
    const reconciled = await Promise.all(
      rows.map((server) => reconcileServer(server)),
    );
    const activeServers = reconciled.filter(isRunningServer);

    await Promise.allSettled(
      activeServers.map(async (server) => {
        try {
          const stats = await withTimeout(
            collectDockerStats(server),
            env.STATS_PULL_TIMEOUT,
          );

          await insertServerStatsSnapshot({
            serverId: server.id,
            ...stats,
          });
        } catch (err) {
          logger.warn(`Failed to collect stats for server ${server.id}`, err);
        }
      }),
    );

    await pruneServerStatsOlderThan(new Date(Date.now() - env.STATS_RETENTION_MS));
  } catch (error) {
    logger.error("Server monitor failed", error);
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
  }, env.MONITOR_INTERVAL_MS);
}

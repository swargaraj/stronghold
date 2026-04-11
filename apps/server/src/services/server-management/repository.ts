import { db } from "@stronghold/db";
import { serverStats, servers } from "@stronghold/db/schema";
import { TRPCError } from "@trpc/server";
import { desc, eq, lt } from "drizzle-orm";

import type { CreateServerInput, UpdateServerInput } from "./schemas";
import { resolveServerType } from "./catalog";
import type { Server, ServerStat, ServerStatus } from "./types";
import { createId, getPrimaryPortMapping, parsePorts, serializeExtraEnv, serializePorts, slugify } from "./utils";

function resolveInputPorts(input: Pick<CreateServerInput, "ports" | "hostPort" | "containerPort">) {
  return input.ports ?? [getPrimaryPortMapping(input)];
}

function resolveUpdatedPorts(server: Server, input: UpdateServerInput) {
  if (input.ports) {
    return input.ports;
  }

  if (input.hostPort || input.containerPort) {
    const [primary, ...rest] = parsePorts(server.portsJson, server);

    return [
      {
        ...(primary ?? getPrimaryPortMapping(server)),
        hostPort: input.hostPort ?? server.hostPort,
        containerPort: input.containerPort ?? server.containerPort,
      },
      ...rest,
    ];
  }

  return parsePorts(server.portsJson, server);
}

export async function insertServer(input: CreateServerInput) {
  const id = createId();
  const slug = slugify(input.name);
  const containerName = `stronghold-mc-${slug}-${id.slice(0, 8)}`;
  const volumeName = `${containerName}-data`;
  const now = new Date();
  const ports = resolveInputPorts(input);
  const [primaryPort] = ports;

  const [server] = await db
    .insert(servers)
    .values({
      id,
      name: input.name,
      containerName,
      image: input.image,
      hostPort: primaryPort?.hostPort ?? input.hostPort,
      containerPort: primaryPort?.containerPort ?? input.containerPort,
      portsJson: serializePorts(ports),
      volumeName,
      memory: input.memory,
      serverType: resolveServerType(input),
      minecraftVersion: input.minecraftVersion,
      motd: input.motd,
      maxPlayers: input.maxPlayers,
      difficulty: input.difficulty,
      gameMode: input.gameMode,
      onlineMode: input.onlineMode,
      enableRcon: true,
      rconPassword: input.rconPassword,
      extraEnvJson: serializeExtraEnv(input.extraEnv),
      status: "creating",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!server) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create server" });
  }

  return server;
}

export async function updateServerRow(server: Server, input: UpdateServerInput) {
  const ports = resolveUpdatedPorts(server, input);
  const [primaryPort] = ports;

  const [updated] = await db
    .update(servers)
    .set({
      name: input.name ?? server.name,
      image: input.image ?? server.image,
      hostPort: primaryPort?.hostPort ?? server.hostPort,
      containerPort: primaryPort?.containerPort ?? server.containerPort,
      portsJson: serializePorts(ports),
      memory: input.memory ?? server.memory,
      serverType: resolveServerType({
        serverPlatform: input.serverPlatform,
        softwareType: input.softwareType,
        serverType: input.serverType ?? server.serverType,
      }),
      minecraftVersion: input.minecraftVersion ?? server.minecraftVersion,
      motd: input.motd ?? server.motd,
      maxPlayers: input.maxPlayers ?? server.maxPlayers,
      difficulty: input.difficulty ?? server.difficulty,
      gameMode: input.gameMode ?? server.gameMode,
      onlineMode: input.onlineMode ?? server.onlineMode,
      enableRcon: true,
      rconPassword: input.rconPassword ?? server.rconPassword,
      extraEnvJson: input.extraEnv ? serializeExtraEnv(input.extraEnv) : server.extraEnvJson,
      updatedAt: new Date(),
    })
    .where(eq(servers.id, server.id))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update server" });
  }

  return updated;
}

export async function getServerRow(id: string) {
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, id),
  });

  if (!server) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
  }

  return server;
}

export function listServerRows() {
  return db.query.servers.findMany({
    orderBy: desc(servers.createdAt),
  });
}

export async function assertHostPortAvailable(hostPort: number, excludeId?: string) {
  const rows = await db.query.servers.findMany();
  const existing = rows.find((server) => {
    if (server.id === excludeId || server.status === "error" || server.status === "missing") {
      return false;
    }

    return parsePorts(server.portsJson, server).some((mapping) => mapping.hostPort === hostPort);
  });

  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Host port ${hostPort} is already assigned to ${existing.name}`,
    });
  }
}

export async function setServerStatus(id: string, status: ServerStatus, statusMessage: string | null = null) {
  const [updated] = await db
    .update(servers)
    .set({
      status,
      statusMessage,
      updatedAt: new Date(),
    })
    .where(eq(servers.id, id))
    .returning();

  return updated;
}

export async function setServerContainerCreated(server: Server, containerId: string) {
  const [updated] = await db
    .update(servers)
    .set({
      containerId,
      status: "created",
      statusMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(servers.id, server.id))
    .returning();

  return updated ?? server;
}

export async function setServerSyncedState(server: Server, status: ServerStatus, statusMessage: string | null) {
  const [updated] = await db
    .update(servers)
    .set({
      status,
      statusMessage,
      updatedAt: new Date(),
    })
    .where(eq(servers.id, server.id))
    .returning();

  return updated ?? server;
}

export async function markServerMissing(server: Server) {
  return setServerSyncedState(server, "missing", "Docker container is missing");
}

export async function markServerError(server: Server, statusMessage: string) {
  await db
    .update(servers)
    .set({
      status: "error",
      statusMessage,
      updatedAt: new Date(),
    })
    .where(eq(servers.id, server.id));
}

export function deleteServerRow(id: string) {
  return db.delete(servers).where(eq(servers.id, id));
}

export async function insertServerStatsSnapshot(snapshot: Omit<ServerStat, "id" | "recordedAt">) {
  const [created] = await db
    .insert(serverStats)
    .values({
      id: createId(),
      ...snapshot,
      recordedAt: new Date(),
    })
    .returning();

  return created;
}

export function listServerStats(serverId: string, limit: number) {
  return db.query.serverStats.findMany({
    where: eq(serverStats.serverId, serverId),
    orderBy: desc(serverStats.recordedAt),
    limit,
  });
}

export function pruneServerStatsOlderThan(cutoff: Date) {
  return db.delete(serverStats).where(lt(serverStats.recordedAt, cutoff));
}

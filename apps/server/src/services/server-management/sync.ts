import { TRPCError } from "@trpc/server";

import { DockerCommandError } from "../docker";
import { inspectContainer, removeContainer, toServerStatus } from "./containers";
import { deleteServerRow, markServerMissing, setServerSyncedState } from "./repository";
import type { Server } from "./types";
import { dockerNotFound, isPendingStatus, runBackground } from "./utils";

async function deleteMissingServer(server: Server) {
  await removeContainer(server, true);
}

function dockerUnavailable(error: unknown): never {
  if (error instanceof DockerCommandError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.stderr || error.message,
    });
  }

  throw error;
}

export async function reconcileServer(server: Server) {
  if (isPendingStatus(server.status)) {
    if (!server.containerId) {
      return server;
    }

    try {
      const state = await inspectContainer(server);
      const status = toServerStatus(state);
      return setServerSyncedState(server, status, state.Error || null);
    } catch (error) {
      if (dockerNotFound(error)) {
        const missing = await markServerMissing(server);
        await deleteServerRow(missing.id);
        runBackground(() => deleteMissingServer(missing));
        return null;
      }

      return dockerUnavailable(error);
    }
  }

  if (server.status === "missing") {
    await deleteServerRow(server.id);
    runBackground(() => deleteMissingServer(server));
    return null;
  }

  if (server.status === "error" && !server.containerId) {
    return server;
  }

  if (!server.containerId) {
    return server;
  }

  try {
    const state = await inspectContainer(server);
    const status = toServerStatus(state);
    return setServerSyncedState(server, status, state.Error || null);
  } catch (error) {
    if (dockerNotFound(error)) {
      const missing = await markServerMissing(server);
      await deleteServerRow(missing.id);
      runBackground(() => deleteMissingServer(missing));
      return null;
    }

    return dockerUnavailable(error);
  }
}

export async function reconcileServerOrThrow(server: Server) {
  const reconciled = await reconcileServer(server);

  if (!reconciled) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Server container is missing and the stale database record is being removed",
    });
  }

  return reconciled;
}

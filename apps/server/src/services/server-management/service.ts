import { TRPCError } from "@trpc/server";

import {
  assertHostPortAvailable,
  getServerRow,
  insertServer,
  listServerRows,
  setServerStatus,
  updateServerRow,
} from "./repository";
import type { CreateServerInput, ExposeServerPortsInput, UnexposeServerPortsInput, UpdateServerInput } from "./schemas";
import { deleteServerJob, provisionServer, recreateServer, runLifecycleJob } from "./jobs";
import { reconcileServer, reconcileServerOrThrow } from "./sync";
import type { ServerStatus } from "./types";
import { parsePorts, runBackground, toApiServer } from "./utils";
import {
  validateCreateRequest,
  validateExposePortsRequest,
  validateLifecycleRequest,
  validateUnexposePortsRequest,
  validateUpdateRequest,
} from "./validation";

async function queueLifecycleCommand(
  id: string,
  action: "start" | "stop" | "restart" | "kill",
  pendingStatus: ServerStatus,
) {
  const server = await getServerRow(id);
  const reconciled = await reconcileServerOrThrow(server);
  validateLifecycleRequest(reconciled);
  const updated = await setServerStatus(reconciled.id, pendingStatus);

  runBackground(() => runLifecycleJob(updated ?? reconciled, action));

  return toApiServer(updated ?? reconciled);
}

export const serverService = {
  async list() {
    const rows = await listServerRows();
    const reconciled = await Promise.all(rows.map((server) => reconcileServer(server)));
    return reconciled.filter((server) => server !== null).map(toApiServer);
  },

  async get(id: string) {
    const server = await getServerRow(id);
    const reconciled = await reconcileServerOrThrow(server);
    return toApiServer(reconciled);
  },

  async create(input: CreateServerInput) {
    if (input.hostPort) {
      await assertHostPortAvailable(input.hostPort);
    }
    await validateCreateRequest(input);
    const server = await insertServer(input);
    runBackground(() => provisionServer(server, input.autoStart));
    return toApiServer(server);
  },

  async update(input: UpdateServerInput) {
    const server = await getServerRow(input.id);

    if (input.ports) {
      for (const mapping of input.ports) {
        if (mapping.hostPort !== undefined) {
          await assertHostPortAvailable(mapping.hostPort, input.id);
        }
      }
    } else if (input.hostPort) {
      await assertHostPortAvailable(input.hostPort, input.id);
    }

    const reconciled = await validateUpdateRequest(server, input);
    const wasRunning = reconciled.status === "running";
    const updated = await updateServerRow(reconciled, input);

    if (input.recreateContainer) {
      const pending = await setServerStatus(updated.id, "creating");
      runBackground(() => recreateServer(pending ?? updated, wasRunning));
      return toApiServer(pending ?? updated);
    }

    return toApiServer(updated);
  },

  async exposePorts(input: ExposeServerPortsInput) {
    const server = await getServerRow(input.id);

    for (const mapping of input.ports) {
      if (mapping.hostPort !== undefined) {
        await assertHostPortAvailable(mapping.hostPort, input.id);
      }
    }

    const reconciled = await validateExposePortsRequest(server, input);
    const currentPorts = parsePorts(reconciled.portsJson, reconciled);
    const mergedPorts = [...currentPorts];

    for (const mapping of input.ports) {
      const index = mergedPorts.findIndex(
        (current) => current.protocol === mapping.protocol && current.containerPort === mapping.containerPort,
      );

      if (index >= 0) {
        mergedPorts[index] = mapping;
      } else {
        mergedPorts.push(mapping);
      }
    }

    const updated = await updateServerRow(reconciled, {
      id: input.id,
      ports: mergedPorts,
      recreateContainer: input.recreateContainer,
    });

    if (input.recreateContainer) {
      const pending = await setServerStatus(updated.id, "creating");
      const wasRunning = reconciled.status === "running";
      runBackground(() => recreateServer(pending ?? updated, wasRunning));
      return toApiServer(pending ?? updated);
    }

    return toApiServer(updated);
  },

  async unexposePorts(input: UnexposeServerPortsInput) {
    const server = await getServerRow(input.id);
    const reconciled = await validateUnexposePortsRequest(server, input);
    const nextPorts = parsePorts(reconciled.portsJson, reconciled).filter(
      (mapping) =>
        !input.ports.some(
          (target) => target.protocol === mapping.protocol && target.containerPort === mapping.containerPort,
        ),
    );

    if (nextPorts.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "At least one port mapping must remain",
      });
    }

    const updated = await updateServerRow(reconciled, {
      id: input.id,
      ports: nextPorts,
      recreateContainer: input.recreateContainer,
    });

    if (input.recreateContainer) {
      const pending = await setServerStatus(updated.id, "creating");
      const wasRunning = reconciled.status === "running";
      runBackground(() => recreateServer(pending ?? updated, wasRunning));
      return toApiServer(pending ?? updated);
    }

    return toApiServer(updated);
  },

  start(id: string) {
    return queueLifecycleCommand(id, "start", "starting");
  },

  stop(id: string) {
    return queueLifecycleCommand(id, "stop", "stopping");
  },

  restart(id: string) {
    return queueLifecycleCommand(id, "restart", "restarting");
  },

  kill(id: string) {
    return queueLifecycleCommand(id, "kill", "killing");
  },

  async delete(id: string) {
    const server = await getServerRow(id);
    const updated = await setServerStatus(server.id, "deleting");
    runBackground(() => deleteServerJob(updated ?? server));
    return toApiServer(updated ?? server);
  },
};

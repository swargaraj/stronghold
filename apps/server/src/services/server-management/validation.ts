import { TRPCError } from "@trpc/server";

import { runDocker } from "../docker";
import { resolveServerType } from "./catalog";
import { reconcileServerOrThrow } from "./sync";
import type {
  CreateServerInput,
  ExposeServerPortsInput,
  PortMapping,
  UnexposeServerPortsInput,
  UpdateServerInput,
} from "./schemas";
import type { Server } from "./types";
import { getPrimaryPortMapping, isPendingStatus, parsePorts } from "./utils";

function conflict(message: string): never {
  throw new TRPCError({
    code: "CONFLICT",
    message,
  });
}

function badRequest(message: string): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message,
  });
}

function internal(message: string): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
  });
}

async function assertDockerAvailable() {
  try {
    await runDocker(["version", "--format", "{{.Server.Version}}"]);
  } catch {
    internal("Docker is not available or the Docker daemon is not running");
  }
}

function assertServerIsMutable(server: Server) {
  if (isPendingStatus(server.status)) {
    conflict(`Server is currently ${server.status}`);
  }
}

function assertNotDeleting(server: Server) {
  if (server.status === "deleting") {
    conflict("Server is being deleted");
  }
}

async function assertHostPortFree(hostPort: number) {
  let listener: { stop(force?: boolean): void } | undefined;

  try {
    listener = Bun.listen({
      hostname: "0.0.0.0",
      port: hostPort,
      socket: {
        data() {},
      },
    });
  } catch {
    conflict(`Host port ${hostPort} is already in use on this machine`);
  } finally {
    listener?.stop(true);
  }
}

async function assertHostPortsFree(ports: PortMapping[]) {
  for (const mapping of ports) {
    if (mapping.hostPort !== undefined) {
      await assertHostPortFree(mapping.hostPort);
    }
  }
}

function resolveRequestPorts(input: Pick<CreateServerInput, "ports" | "hostPort" | "containerPort">) {
  return input.ports ?? [getPrimaryPortMapping(input)];
}

function assertCompatibleConfig(input: CreateServerInput | UpdateServerInput) {
  const resolvedServerType = resolveServerType(input);

  if (input.serverPlatform === "BEDROCK" && input.softwareType && input.softwareType !== "VANILLA") {
    badRequest("Bedrock only supports the vanilla software type");
  }

  if (input.serverPlatform === "BEDROCK" && input.minecraftVersion === "SNAPSHOT") {
    badRequest("SNAPSHOT is only available for Java vanilla servers");
  }

  if (resolvedServerType === "VANILLA" && input.extraEnv && ("MODPACK" in input.extraEnv || "CF_API_KEY" in input.extraEnv)) {
    badRequest("Modpack environment variables require a modded server type");
  }
}

export async function validateCreateRequest(input: CreateServerInput) {
  assertCompatibleConfig(input);
  await assertDockerAvailable();
  await assertHostPortsFree(resolveRequestPorts(input));
}

export async function validateUpdateRequest(server: Server, input: UpdateServerInput) {
  const reconciled = await reconcileServerOrThrow(server);
  assertServerIsMutable(reconciled);
  assertCompatibleConfig(input);

  if (input.recreateContainer) {
    await assertDockerAvailable();
  }

  const currentPorts = parsePorts(reconciled.portsJson, reconciled);
  const nextPorts = input.ports
    ? input.ports
    : input.hostPort || input.containerPort
      ? [
          {
            ...(currentPorts[0] ?? getPrimaryPortMapping(reconciled)),
            hostPort: input.hostPort ?? reconciled.hostPort,
            containerPort: input.containerPort ?? reconciled.containerPort,
          },
          ...currentPorts.slice(1),
        ]
      : currentPorts;

  for (const mapping of nextPorts) {
    const existing = currentPorts.find(
      (current) =>
        current.protocol === mapping.protocol &&
        current.containerPort === mapping.containerPort &&
        current.hostPort === mapping.hostPort &&
        current.exposure === mapping.exposure,
    );

    if (!existing && mapping.hostPort !== undefined) {
      await assertHostPortFree(mapping.hostPort);
    }
  }

  return reconciled;
}

export async function validateExposePortsRequest(server: Server, input: ExposeServerPortsInput) {
  const reconciled = await reconcileServerOrThrow(server);
  assertServerIsMutable(reconciled);

  if (input.recreateContainer) {
    await assertDockerAvailable();
  }

  const currentPorts = parsePorts(reconciled.portsJson, reconciled);

  for (const mapping of input.ports) {
    const exists = currentPorts.find(
      (current) => current.protocol === mapping.protocol && current.containerPort === mapping.containerPort,
    );

    if (!exists && mapping.hostPort !== undefined) {
      await assertHostPortFree(mapping.hostPort);
    }

    if (exists && exists.hostPort !== mapping.hostPort && mapping.hostPort !== undefined) {
      await assertHostPortFree(mapping.hostPort);
    }
  }

  return reconciled;
}

export async function validateUnexposePortsRequest(server: Server, input: UnexposeServerPortsInput) {
  const reconciled = await reconcileServerOrThrow(server);
  assertServerIsMutable(reconciled);

  if (input.recreateContainer) {
    await assertDockerAvailable();
  }

  return reconciled;
}

export function validateLifecycleRequest(server: Server) {
  assertServerIsMutable(server);
  assertNotDeleting(server);
}

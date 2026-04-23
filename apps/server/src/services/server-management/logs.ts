import { DockerCommandError, runDocker } from "../docker";
import type { Server } from "./types";

const javaReadyPatterns = [/Done \([\d.]+s\)!/i, /For help, type "help"/i];

const bedrockReadyPatterns = [/Server started\./i, /IPv4 supported, port:/i];

const errorPatterns = [/failed to bind/i, /exception/i, /fatal/i, /error:/i];

export type MinecraftRuntimeStatus = "offline" | "starting" | "ready" | "error";

export type MinecraftLogSnapshot = {
  lines: string[];
  latestLine: string | null;
  status: MinecraftRuntimeStatus;
};

function splitLogLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function readyPatterns(serverType: string) {
  return serverType === "BEDROCK" ? bedrockReadyPatterns : javaReadyPatterns;
}

export function inferMinecraftStatus(
  server: Pick<Server, "serverType" | "status">,
  lines: string[],
): MinecraftRuntimeStatus {
  if (server.status !== "running") {
    return "offline";
  }

  if (lines.some((line) => errorPatterns.some((pattern) => pattern.test(line)))) {
    return "error";
  }

  if (
    lines.some((line) => readyPatterns(server.serverType).some((pattern) => pattern.test(line)))
  ) {
    return "ready";
  }

  return "starting";
}

export async function getContainerLogs(
  server: Pick<Server, "containerId" | "containerName">,
  tail = 200,
) {
  try {
    const result = await runDocker([
      "logs",
      "--tail",
      String(tail),
      server.containerId ?? server.containerName,
    ]);

    const lines = splitLogLines([result.stdout, result.stderr].filter(Boolean).join("\n"));
    return lines;
  } catch (error) {
    if (error instanceof DockerCommandError) {
      const lines = splitLogLines(error.stderr || error.message);
      return lines;
    }

    throw error;
  }
}

export async function getMinecraftLogSnapshot(
  server: Pick<Server, "containerId" | "containerName" | "serverType" | "status">,
) {
  const lines = await getContainerLogs(server);

  return {
    latestLine: lines.at(-1) ?? null,
    lines,
    status: inferMinecraftStatus(server, lines),
  } satisfies MinecraftLogSnapshot;
}

export function streamContainerLogs(
  server: Pick<Server, "containerId" | "containerName">,
  onLine: (line: string, stream: "stdout" | "stderr") => void,
) {
  const process = Bun.spawn(
    ["docker", "logs", "--tail", "200", "-f", server.containerId ?? server.containerName],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  void readStream(process.stdout, "stdout", onLine);
  void readStream(process.stderr, "stderr", onLine);

  return process;
}

async function readStream(
  stream: ReadableStream<Uint8Array> | null,
  source: "stdout" | "stderr",
  onLine: (line: string, stream: "stdout" | "stderr") => void,
) {
  if (!stream) {
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.trimEnd();

        if (line) {
          onLine(line, source);
        }
      }
    }

    const finalLine = buffer.trimEnd();

    if (finalLine) {
      onLine(finalLine, source);
    }
  } finally {
    reader.releaseLock();
  }
}

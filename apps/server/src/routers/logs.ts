import { Elysia, t } from "elysia";
import { getServerRow } from "@/services/server-management/repository";
import { streamContainerLogs } from "@/services/server-management/logs";
import { isAuthorizedToken } from "@/lib/utils";
import { env } from "@stronghold/env/server";

const logStreams = new Map<string, ReturnType<typeof streamContainerLogs>>();

export const logsRoutes = new Elysia({ prefix: "/ws" }).ws("/logs/:serverId", {
  params: t.Object({
    serverId: t.String(),
  }),

  query: t.Object({
    auth: t.Optional(t.String()),
  }),

  async open(socket) {
    if (logStreams.size >= env.MAX_WS_CONNECTIONS) {
      socket.send(
        JSON.stringify({ type: "error", message: "Too many connections" }),
      );
      socket.close();
      return;
    }

    const { auth } = socket.data.query;

    if (!isAuthorizedToken(auth ?? null)) {
      socket.send(JSON.stringify({ type: "error", message: "FORBIDDEN" }));
      socket.close();
      return;
    }

    const { serverId } = socket.data.params;

    try {
      const server = await getServerRow(serverId);

      if (!server) {
        socket.send(
          JSON.stringify({ type: "error", message: "Server not found" }),
        );
        socket.close();
        return;
      }

      const process = streamContainerLogs(server, (line, stream) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "log", stream, line }));
        }
      });

      logStreams.set(socket.id, process);

      void process.exited.finally(() => {
        if (logStreams.get(socket.id) !== process) return;

        logStreams.delete(socket.id);

        if (socket.readyState === 1) {
          socket.close();
        }
      });
    } catch (err) {
      if (socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Failed to stream logs",
          }),
        );
        socket.close();
      }
    }
  },

  close(socket) {
    const process = logStreams.get(socket.id);

    if (process) {
      process.kill();
      logStreams.delete(socket.id);
    }
  },
});

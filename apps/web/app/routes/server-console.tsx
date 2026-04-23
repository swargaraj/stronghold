import type { Route } from "./+types/server-console";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircleIcon, WifiOffIcon } from "lucide-react";

import { api, buildWebSocketUrl } from "~/lib/api";
import { getStoredConnection } from "~/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

type LogMessage = {
  type: "log" | "error";
  line?: string;
  message?: string;
  stream?: "stdout" | "stderr";
};

type ApiServer = {
  id: string;
  status: string;
};

function canStreamLogs(status: string) {
  return [
    "creating",
    "starting",
    "running",
    "restarting",
    "stopping",
    "killing",
    "deleting",
  ].includes(status);
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const connection = getStoredConnection();

  if (!connection) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const server = await api.query<ApiServer>("servers.get", {
    ...connection,
    input: { id: params.serverId },
  });

  return {
    connection,
    serverId: params.serverId,
    server,
  };
}

clientLoader.hydrate = true as const;

export default function ServerConsole({ loaderData }: Route.ComponentProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<"connecting" | "open" | "closed">(
    "connecting",
  );
  const [serverStatus, setServerStatus] = useState(loaderData.server.status);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const socketUrl = useMemo(
    () =>
      buildWebSocketUrl(loaderData.connection.endpoint, `/ws/logs/${loaderData.serverId}`, {
        auth: loaderData.connection.token,
      }),
    [loaderData.connection.endpoint, loaderData.connection.token, loaderData.serverId],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      void api
        .query<ApiServer>("servers.get", {
          ...loaderData.connection,
          input: { id: loaderData.serverId },
        })
        .then((server) => {
          setServerStatus(server.status);
        })
        .catch(() => {});
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loaderData.connection, loaderData.serverId]);

  useEffect(() => {
    if (!canStreamLogs(serverStatus)) {
      setConnectionState("closed");
      return;
    }

    let isActive = true;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(socketUrl);

      setConnectionState("connecting");

      socket.addEventListener("open", () => {
        setConnectionState("open");
      });

      socket.addEventListener("close", () => {
        setConnectionState("closed");

        if (!isActive) {
          return;
        }

        reconnectTimer = window.setTimeout(connect, 2000);
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as LogMessage;

          if (payload.type === "error") {
            setLines((current) => [
              ...current.slice(-399),
              `[error] ${payload.message ?? "Stream error"}`,
            ]);
            return;
          }

          const nextLine = payload.line;

          if (typeof nextLine === "string") {
            setLines((current) => [...current.slice(-399), nextLine]);
          } else {
            setLines((current) => [...current.slice(-399), "[log] <empty line>"]);
          }
        } catch {
          setLines((current) => [...current.slice(-399), String(event.data)]);
        }
      });
    };

    connect();

    return () => {
      isActive = false;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [serverStatus, socketUrl]);

  useEffect(() => {
    const element = terminalRef.current;

    if (!element) {
      return;
    }

    if (shouldAutoScrollRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lines]);

  function handleScroll() {
    const element = terminalRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 24;
  }

  return (
    <Card className="min-h-[640px]">
      <CardHeader>
        <CardTitle>Console</CardTitle>
        <CardDescription>Live Docker log stream over websocket.</CardDescription>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-2 text-sm">
          {connectionState === "connecting" && (
            <>
              <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Connecting to log stream...</span>
            </>
          )}
          {connectionState === "open" && (
            <>
              <span className="inline-flex size-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Streaming live logs</span>
            </>
          )}
          {connectionState === "closed" && (
            <>
              <WifiOffIcon className="size-4 text-destructive" />
              <span className="text-muted-foreground">Log stream disconnected</span>
            </>
          )}
        </div>
        <div
          onScroll={handleScroll}
          ref={terminalRef}
          className="h-[520px] overflow-auto rounded-2xl bg-neutral-950 p-4 font-mono text-neutral-100 text-sm leading-6"
        >
          {lines.length === 0 ? (
            <div className="text-neutral-500">Waiting for server logs...</div>
          ) : (
            lines.map((line, index) => (
              <div
                key={`${index}-${line.slice(0, 24)}`}
                className="whitespace-pre-wrap break-words"
              >
                {line}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

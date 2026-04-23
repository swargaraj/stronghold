import type { Route } from "./+types/server-overview";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CpuIcon,
  MemoryStickIcon,
  PlayIcon,
  PowerIcon,
  RefreshCcwIcon,
  SkullIcon,
  UsersIcon,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { api } from "~/lib/api";
import { getStoredConnection } from "~/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { buildWebSocketUrl } from "~/lib/api";

type ServerDetails = {
  currentStats: {
    cpuPercent: number | null;
    memoryPercent: number | null;
    playersOnline: number | null;
    recordedAt: string | number | Date;
  } | null;
  history: Array<{
    cpuPercent: number | null;
    memoryPercent: number | null;
    playersOnline: number | null;
    recordedAt: string | number | Date;
  }>;
  minecraft: {
    maxPlayers: number;
    memory: string;
    motd: string;
    onlineMode: boolean;
    port: number;
    ready: boolean;
    serverType: string;
    status: "offline" | "starting" | "ready" | "error";
    version: string;
  };
  runtime: {
    containerId: string | null;
    containerName: string;
    image: string;
    volumeName: string;
  };
  server: {
    id: string;
    name: string;
    status: string;
    statusMessage: string | null;
  };
};

const chartConfig = {
  cpu: {
    color: "var(--chart-1)",
    label: "CPU Usage %",
  },
  memory: {
    color: "var(--chart-2)",
    label: "Memory Usage %",
  },
} satisfies ChartConfig;

type LogMessage = {
  type: "log" | "error";
  line?: string;
  message?: string;
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

function normalizePercent(value: number | null, options?: { capAt100?: boolean }) {
  if (value === null) {
    return null;
  }

  const normalized = Math.abs(value) > 100 ? value / 100 : value;
  return options?.capAt100 ? Math.min(normalized, 100) : normalized;
}

function getContainerStatusVariant(
  status: string,
): "default" | "error" | "success" | "warning" | "info" {
  if (status === "running") {
    return "success";
  }

  if (status === "error" || status === "missing") {
    return "error";
  }

  if (status === "stopped" || status === "killed") {
    return "warning";
  }

  return "info";
}

function getMinecraftStatusVariant(
  status: ServerDetails["minecraft"]["status"],
): "default" | "error" | "success" | "warning" | "info" {
  if (status === "ready") {
    return "success";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "offline") {
    return "warning";
  }

  return "info";
}

function canStart(status: string) {
  return ["created", "stopped", "killed", "error"].includes(status);
}

function canStop(status: string) {
  return status === "running";
}

function canRestart(status: string) {
  return status === "running";
}

function canKill(status: string) {
  return ["running", "starting", "restarting", "stopping"].includes(status);
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const connection = getStoredConnection();

  if (!connection) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const details = await api.query<ServerDetails>("servers.details", {
    ...connection,
    input: { id: params.serverId },
  });

  return {
    connection,
    details,
  };
}

clientLoader.hydrate = true as const;

export default function ServerOverview({ loaderData }: Route.ComponentProps) {
  const [timeRange, setTimeRange] = useState("24h");
  const [details, setDetails] = useState(loaderData.details as ServerDetails);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const logPanelRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const connection = loaderData.connection;
  const shouldConnectLogs = canStreamLogs(details.server.status);
  const socketUrl = useMemo(
    () =>
      buildWebSocketUrl(connection.endpoint, `/ws/logs/${details.server.id}`, {
        auth: connection.token,
      }),
    [connection.endpoint, connection.token, details.server.id],
  );

  async function refreshDetails() {
    const nextDetails = await api.query<ServerDetails>("servers.details", {
      ...connection,
      input: { id: details.server.id },
    });

    setDetails(nextDetails);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshDetails().catch(() => {});
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [connection, details.server.id]);

  useEffect(() => {
    if (!shouldConnectLogs) {
      return;
    }

    let isActive = true;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(socketUrl);

      socket.addEventListener("open", () => {});

      socket.addEventListener("close", () => {
        if (!isActive) {
          return;
        }

        reconnectTimer = window.setTimeout(connect, 2000);
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as LogMessage;

          if (payload.type === "error") {
            setLogLines((current) => [
              ...current.slice(-79),
              `[error] ${payload.message ?? "Stream error"}`,
            ]);
            return;
          }

          const nextLine = payload.line;

          if (typeof nextLine === "string" && nextLine.trim()) {
            setLogLines((current) => [...current.slice(-79), nextLine]);
          }
        } catch {
          setLogLines((current) => [...current.slice(-79), String(event.data)]);
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
  }, [shouldConnectLogs, socketUrl]);

  useEffect(() => {
    const element = logPanelRef.current;

    if (!element) {
      return;
    }

    if (shouldAutoScrollRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logLines]);

  function handleLogScroll() {
    const element = logPanelRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 24;
  }

  async function runAction(action: "start" | "stop" | "restart" | "kill") {
    setPendingAction(action);
    setActionError(null);

    try {
      await api.mutation(`servers.${action}`, {
        ...connection,
        input: { id: details.server.id },
      });

      await refreshDetails();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Failed to ${action} the server.`);
    } finally {
      setPendingAction(null);
    }
  }

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const windowMs =
      timeRange === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : timeRange === "3h"
          ? 3 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

    return [...details.history]
      .filter((item) => now - new Date(item.recordedAt).getTime() <= windowMs)
      .sort((left, right) => {
        return new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime();
      })
      .map((item) => ({
        cpu: normalizePercent(item.cpuPercent) ?? 0,
        memory: normalizePercent(item.memoryPercent, { capAt100: true }) ?? 0,
        recordedAt: new Date(item.recordedAt).toISOString(),
      }));
  }, [details.history, timeRange]);

  const currentCpuPercent = normalizePercent(details.currentStats?.cpuPercent ?? null);
  const currentMemoryPercent = normalizePercent(details.currentStats?.memoryPercent ?? null, {
    capAt100: true,
  });

  return (
    <div className="flex flex-col gap-6">
      {actionError && (
        <Alert variant="error">
          <AlertTitle>Lifecycle action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Runtime Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={getContainerStatusVariant(details.server.status)}>
              Container {details.server.status}
            </Badge>
            <Badge variant={getMinecraftStatusVariant(details.minecraft.status)}>
              Minecraft {details.minecraft.status}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <CpuIcon className="size-3.5" />
                CPU
              </div>
              <p className="mt-1 font-medium">{currentCpuPercent ?? 0}%</p>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <MemoryStickIcon className="size-3.5" />
                Memory
              </div>
              <p className="mt-1 font-medium">{currentMemoryPercent ?? 0}%</p>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <UsersIcon className="size-3.5" />
                Players
              </div>
              <p className="mt-1 font-medium">
                {details.currentStats?.playersOnline ?? 0}/{details.minecraft.maxPlayers}
              </p>
            </div>
          </div>
          <div className={"flex gap-3 items-center"}>
            <span className={"font-semibold"}>Actions</span>
            <Button
              disabled={!canStart(details.server.status)}
              loading={pendingAction === "start"}
              onClick={() => void runAction("start")}
            >
              <PlayIcon />
              Start
            </Button>
            <Button
              disabled={!canStop(details.server.status)}
              loading={pendingAction === "stop"}
              onClick={() => void runAction("stop")}
              variant="outline"
            >
              <PowerIcon />
              Stop
            </Button>
            <Button
              disabled={!canRestart(details.server.status)}
              loading={pendingAction === "restart"}
              onClick={() => void runAction("restart")}
              variant="outline"
            >
              <RefreshCcwIcon />
              Restart
            </Button>
            <Button
              disabled={!canKill(details.server.status)}
              loading={pendingAction === "kill"}
              onClick={() => void runAction("kill")}
              variant="destructive-outline"
            >
              <SkullIcon />
              Force Kill
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Console Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="h-96 overflow-auto rounded-md bg-neutral-950 p-4 font-mono text-neutral-100 text-sm leading-6"
            onScroll={handleLogScroll}
            ref={logPanelRef}
          >
            {logLines.length === 0 ? (
              <div className="text-neutral-500">No server logs</div>
            ) : (
              logLines.map((line, index) => (
                <div
                  key={`${index}-${line.slice(0, 24)}`}
                  className="whitespace-pre-wrap wrap-break-word"
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="pt-0">
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1">
            <CardTitle>Resource History</CardTitle>
            <CardDescription>CPU and memory usage over time.</CardDescription>
          </div>
          <Select onValueChange={(value) => value && setTimeRange(value)} value={timeRange}>
            <SelectTrigger className="w-40 rounded-lg" aria-label="Select a range">
              <SelectValue placeholder="Last 24 hours" />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="3h">Last 3 hours</SelectItem>
            </SelectPopup>
          </Select>
        </CardHeader>
        <CardContent className="grid gap-4 px-2 pt-4 sm:grid-cols-2 sm:px-6 sm:pt-6">
          <ResourceHistoryChart
            colorKey="cpu"
            data={filteredHistory}
            dataKey="cpu"
            gradientId="fillCpu"
            title="CPU Usage"
          />
          <ResourceHistoryChart
            colorKey="memory"
            data={filteredHistory}
            dataKey="memory"
            gradientId="fillMemory"
            title="Memory Usage"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Server Information</CardTitle>
          <CardDescription>Core runtime and Minecraft configuration details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 text-sm">
          <InfoRow label="Container" value={details.runtime.containerName} />
          <InfoRow label="Image" value={details.runtime.image} />
          <InfoRow label="Version" value={details.minecraft.version} />
          <InfoRow label="Software" value={details.minecraft.serverType} />
          <InfoRow label="Port" value={String(details.minecraft.port)} />
          <InfoRow label="Memory" value={details.minecraft.memory} />
          <InfoRow label="MOTD" value={details.minecraft.motd} />
          <InfoRow
            label="Online Mode"
            value={details.minecraft.onlineMode ? "Enabled" : "Disabled"}
          />
          <InfoRow label="Volume" value={details.runtime.volumeName} />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium break-all">{value}</span>
    </div>
  );
}

function ResourceHistoryChart({
  colorKey,
  data,
  dataKey,
  gradientId,
  title,
}: {
  colorKey: "cpu" | "memory";
  data: Array<{ cpu: number; memory: number; recordedAt: string }>;
  dataKey: "cpu" | "memory";
  gradientId: string;
  title: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-3">
        <p className="font-medium text-sm">{title}</p>
      </div>
      <ChartContainer className="h-65 w-full" config={chartConfig}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{
              left: 8,
              right: 8,
            }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${colorKey})`} stopOpacity={0.75} />
                <stop offset="95%" stopColor={`var(--color-${colorKey})`} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="recordedAt"
              minTickGap={32}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })
              }
              tickLine={false}
              tickMargin={8}
              fontSize={12}
            />
            <YAxis axisLine={false} domain={[0, 100]} tickLine={false} width={32} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value) =>
                    new Date(value ?? Date.now()).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  }
                />
              }
            />
            <Area
              dataKey={dataKey}
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              stroke={`var(--color-${colorKey})`}
              type="stepAfter"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}

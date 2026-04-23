import type { Route } from "./+types/server-network";
import { GlobeIcon, LockIcon, NetworkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "~/lib/api";
import { getStoredConnection } from "~/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type PortProtocol = "tcp" | "udp";
type PortExposure = "public" | "localhost" | "internal";

type PortMapping = {
  hostPort?: number;
  containerPort: number;
  protocol: PortProtocol;
  exposure: PortExposure;
};

type ServerDetails = {
  minecraft: {
    maxPlayers: number;
    memory: string;
    motd: string;
    onlineMode: boolean;
    port: number;
    ports: PortMapping[];
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

function getExposureVariant(
  exposure: PortExposure,
): "default" | "error" | "success" | "warning" | "info" {
  if (exposure === "public") {
    return "error";
  }

  if (exposure === "localhost") {
    return "success";
  }

  return "default";
}

function getBindingLabel(mapping: PortMapping) {
  if (mapping.exposure === "internal") {
    return "Container only";
  }

  const host = mapping.hostPort ?? "unassigned";
  return mapping.exposure === "localhost" ? `127.0.0.1:${host}` : `0.0.0.0:${host}`;
}

function formatProtocol(protocol: PortProtocol) {
  return protocol.toUpperCase();
}

function parsePortInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    return null;
  }

  return parsed;
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

export default function ServerNetwork({ loaderData }: Route.ComponentProps) {
  const [details, setDetails] = useState(loaderData.details as ServerDetails);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"expose" | "unexpose" | null>(null);
  const [pendingPortKey, setPendingPortKey] = useState<string | null>(null);
  const [containerPort, setContainerPort] = useState("25565");
  const [hostPort, setHostPort] = useState("");
  const [protocol, setProtocol] = useState<PortProtocol>("tcp");
  const [exposure, setExposure] = useState<PortExposure>("localhost");
  const [recreateOnExpose, setRecreateOnExpose] = useState(true);
  const [recreateOnUnexpose, setRecreateOnUnexpose] = useState(true);
  const connection = loaderData.connection;

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
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [connection, details.server.id]);

  async function handleExposePort() {
    setActionError(null);

    const nextContainerPort = parsePortInput(containerPort);
    const nextHostPort = exposure === "internal" ? undefined : parsePortInput(hostPort);

    if (nextContainerPort === null) {
      setActionError("Container port must be between 1024 and 65535.");
      return;
    }

    if (exposure !== "internal" && typeof nextHostPort === "undefined") {
      setActionError("Host port must be between 1024 and 65535 for exposed mappings.");
      return;
    }

    setPendingAction("expose");

    try {
      await api.mutation("servers.exposePorts", {
        ...connection,
        input: {
          id: details.server.id,
          ports: [
            {
              containerPort: nextContainerPort,
              exposure,
              hostPort: nextHostPort,
              protocol,
            },
          ],
          recreateContainer: recreateOnExpose,
        },
      });

      setHostPort("");
      await refreshDetails();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to expose the port.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUnexposePort(mapping: PortMapping) {
    setActionError(null);
    const portKey = `${mapping.protocol}:${mapping.containerPort}`;
    setPendingAction("unexpose");
    setPendingPortKey(portKey);

    try {
      await api.mutation("servers.unexposePorts", {
        ...connection,
        input: {
          id: details.server.id,
          ports: [
            {
              containerPort: mapping.containerPort,
              protocol: mapping.protocol,
            },
          ],
          recreateContainer: recreateOnUnexpose,
        },
      });

      await refreshDetails();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to unexpose the port.");
    } finally {
      setPendingAction(null);
      setPendingPortKey(null);
    }
  }

  const portMappings = details.minecraft.ports;

  return (
    <div className="flex flex-col gap-6">
      {actionError && (
        <Alert variant="error">
          <AlertTitle>Network update failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Port Mappings</CardTitle>
            <CardDescription>Manage host-to-container bindings for this server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {portMappings.length === 0 ? (
              <Empty className="border py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <NetworkIcon />
                  </EmptyMedia>
                  <EmptyTitle>No mapped ports</EmptyTitle>
                  <EmptyDescription>
                    Expose a host port to make a container service reachable from outside.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent />
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Container</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Exposure</TableHead>
                    <TableHead>Reachability</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {portMappings.map((mapping) => {
                    const portKey = `${mapping.protocol}:${mapping.containerPort}`;

                    return (
                      <TableRow key={portKey}>
                        <TableCell>{mapping.containerPort}</TableCell>
                        <TableCell>{mapping.hostPort ?? "Internal"}</TableCell>
                        <TableCell>{formatProtocol(mapping.protocol)}</TableCell>
                        <TableCell>
                          <Badge variant={getExposureVariant(mapping.exposure)}>
                            {mapping.exposure}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {getBindingLabel(mapping)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            loading={pendingAction === "unexpose" && pendingPortKey === portKey}
                            onClick={() => void handleUnexposePort(mapping)}
                            size="sm"
                            variant="outline"
                          >
                            <Trash2Icon />
                            Unexpose
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                checked={recreateOnUnexpose}
                onCheckedChange={(checked) => setRecreateOnUnexpose(Boolean(checked))}
              />
              <div className="space-y-1">
                <p className="font-medium text-sm">Recreate container after unexposing</p>
                <p className="text-muted-foreground text-sm">
                  Turn this off only if you plan to reconcile the container separately.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Expose Port</CardTitle>
              <CardDescription>Add or replace a port mapping for the container.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="container-port">Container port</Label>
                  <Input
                    id="container-port"
                    inputMode="numeric"
                    onChange={(event) => setContainerPort(event.target.value)}
                    placeholder="25565"
                    value={containerPort}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="host-port">Host port</Label>
                  <Input
                    disabled={exposure === "internal"}
                    id="host-port"
                    inputMode="numeric"
                    onChange={(event) => setHostPort(event.target.value)}
                    placeholder={exposure === "internal" ? "Not used for internal" : "25565"}
                    value={hostPort}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Protocol</Label>
                  <Select
                    onValueChange={(value) => value && setProtocol(value as PortProtocol)}
                    value={protocol}
                  >
                    <SelectTrigger aria-label="Select protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Exposure</Label>
                  <Select
                    onValueChange={(value) => {
                      if (!value) {
                        return;
                      }

                      const nextExposure = value as PortExposure;
                      setExposure(nextExposure);

                      if (nextExposure === "internal") {
                        setHostPort("");
                      }
                    }}
                    value={exposure}
                  >
                    <SelectTrigger aria-label="Select exposure">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="localhost">Localhost only</SelectItem>
                      <SelectItem value="internal">Internal only</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={recreateOnExpose}
                  onCheckedChange={(checked) => setRecreateOnExpose(Boolean(checked))}
                />
                <div className="space-y-1">
                  <p className="font-medium text-sm">Recreate container after exposing</p>
                  <p className="text-muted-foreground text-sm">
                    Required if you want Docker to pick up the new binding immediately.
                  </p>
                </div>
              </div>

              <Button loading={pendingAction === "expose"} onClick={() => void handleExposePort()}>
                <PlusIcon />
                Expose port
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exposure Modes</CardTitle>
              <CardDescription>
                Choose the smallest surface area that fits the use case.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <GlobeIcon className="size-4" />
                  Public
                </div>
                <p className="text-muted-foreground">
                  Binds to <Badge variant={"outline"}>0.0.0.0</Badge> so the port is reachable from
                  the network.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <LockIcon className="size-4" />
                  Localhost
                </div>
                <p className="text-muted-foreground">
                  Binds to <Badge variant={"outline"}>127.0.0.1</Badge> so only the host machine can
                  reach it.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

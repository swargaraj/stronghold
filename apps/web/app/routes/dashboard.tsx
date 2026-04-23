import type { Route } from "./+types/dashboard";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon, HardDriveIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { api } from "~/lib/api";
import { getStoredConnection } from "~/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
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

type ApiServer = {
  id: string;
  name: string;
  status: string;
  statusMessage: string | null;
  memory: string;
  minecraftVersion: string;
  hostPort: number;
  serverPlatform: string;
  softwareType: string;
  createdAt: string | number | Date;
};

type LoaderData = {
  connection: {
    endpoint: string;
    token: string;
  };
  servers: ApiServer[];
};

type SoftwareResponse = {
  software: string[];
  serverType: string;
};

type VersionResponse = {
  serverType: string;
  software: string;
  versionType: string;
  versions: string[];
};

const createServerFormSchema = z.object({
  autoStart: z.boolean(),
  hostPort: z.coerce.number().int().min(1024).max(65535),
  image: z.string().trim().min(1, "Docker image is required."),
  maxPlayers: z.coerce.number().int().min(1).max(500),
  memory: z
    .string()
    .trim()
    .regex(/^([1-9]\d*)(M|G)$/i, "Use M or G, for example 2G."),
  minecraftVersion: z.string().trim().min(1, "Select a Minecraft version."),
  motd: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1, "Server name is required.").max(80),
  onlineMode: z.boolean(),
  softwareType: z.string().trim().min(1, "Select a software type."),
});

type CreateServerFormValues = z.output<typeof createServerFormSchema>;

function getStatusVariant(status: string): "default" | "error" | "success" | "warning" | "info" {
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

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Servers | Stronghold" },
    {
      name: "description",
      content: "Browse and create managed Stronghold servers.",
    },
  ];
}

export async function clientLoader() {
  const connection = getStoredConnection();

  if (!connection) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const servers = await api.query<ApiServer[]>("servers.list", connection);

  return {
    connection,
    servers,
  };
}

clientLoader.hydrate = true as const;

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { connection, servers: initialServers } = loaderData as LoaderData;
  const [servers, setServers] = useState(initialServers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [softwareOptions, setSoftwareOptions] = useState<string[]>([]);
  const [versionOptions, setVersionOptions] = useState<string[]>([]);
  const [isLoadingSoftware, setIsLoadingSoftware] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const sortedServers = useMemo(
    () =>
      [...servers].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [servers],
  );
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<z.input<typeof createServerFormSchema>, unknown, CreateServerFormValues>({
    defaultValues: {
      autoStart: true,
      hostPort: 25565,
      image: "itzg/minecraft-server:latest",
      maxPlayers: 20,
      memory: "2G",
      minecraftVersion: "LATEST",
      motd: "A Stronghold Minecraft Server",
      name: "",
      onlineMode: true,
      softwareType: "",
    },
    resolver: zodResolver(createServerFormSchema),
  });
  const selectedSoftware = watch("softwareType");

  useEffect(() => {
    let isActive = true;

    async function refreshServers() {
      try {
        const nextServers = await api.query<ApiServer[]>("servers.list", connection);

        if (isActive) {
          setServers(nextServers);
        }
      } catch {
        // Keep the last successful snapshot on list refresh failures.
      }
    }

    const timer = window.setInterval(() => {
      void refreshServers();
    }, 10000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [connection]);

  useEffect(() => {
    if (dialogOpen) {
      return;
    }

    setCreateError(null);
    reset({
      autoStart: true,
      hostPort: 25565,
      image: "itzg/minecraft-server:latest",
      maxPlayers: 20,
      memory: "2G",
      minecraftVersion: "",
      motd: "A Stronghold Minecraft Server",
      name: "",
      onlineMode: true,
      softwareType: "",
    });
  }, [dialogOpen, reset]);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    let isActive = true;

    async function loadSoftware() {
      setIsLoadingSoftware(true);

      try {
        const response = await api.meta<SoftwareResponse>({
          endpoint: connection.endpoint,
          path: "/meta/software",
          query: {
            serverType: "JAVA",
          },
        });

        if (!isActive) {
          return;
        }

        setSoftwareOptions(response.software);

        const nextSoftware = response.software[0] ?? "";
        setValue("softwareType", nextSoftware, {
          shouldDirty: false,
          shouldValidate: true,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setCreateError(error instanceof Error ? error.message : "Failed to load software options.");
      } finally {
        if (isActive) {
          setIsLoadingSoftware(false);
        }
      }
    }

    void loadSoftware();

    return () => {
      isActive = false;
    };
  }, [connection.endpoint, dialogOpen, setValue]);

  useEffect(() => {
    if (!dialogOpen || !selectedSoftware) {
      setVersionOptions([]);
      return;
    }

    let isActive = true;

    async function loadVersions() {
      setIsLoadingVersions(true);

      try {
        const response = await api.meta<VersionResponse>({
          endpoint: connection.endpoint,
          path: `/meta/software/${selectedSoftware.toLowerCase()}/versions`,
          query: {
            serverType: "JAVA",
          },
        });

        if (!isActive) {
          return;
        }

        setVersionOptions(response.versions);

        const nextVersion = response.versions[0] ?? "";
        setValue("minecraftVersion", nextVersion, {
          shouldDirty: false,
          shouldValidate: true,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setVersionOptions([]);
        setValue("minecraftVersion", "", {
          shouldDirty: false,
          shouldValidate: true,
        });
        setCreateError(error instanceof Error ? error.message : "Failed to load version options.");
      } finally {
        if (isActive) {
          setIsLoadingVersions(false);
        }
      }
    }

    void loadVersions();

    return () => {
      isActive = false;
    };
  }, [connection.endpoint, dialogOpen, selectedSoftware, setValue]);

  async function onCreateServer(values: CreateServerFormValues) {
    setCreateError(null);

    try {
      const createdServer = await api.mutation<ApiServer>("servers.create", {
        ...connection,
        input: {
          ...values,
          softwareType: values.softwareType === "SNAPSHOT" ? "VANILLA" : values.softwareType,
        },
      });

      setServers((currentServers) => [createdServer, ...currentServers]);
      setDialogOpen(false);
      reset();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create the server.");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className={"flex justify-between items-center py-4 bg-neutral-950 px-4 md:px-6"}>
        <h1 className="font-medium text-lg text-neutral-100">Manage Your Stronghold Servers</h1>
        <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
          <DialogTrigger
            render={
              <Button className="shrink-0 bg-neutral-100 text-primary hover:bg-neutral-300" />
            }
          >
            <PlusIcon />
            Create Server
          </DialogTrigger>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Create server</DialogTitle>
              <DialogDescription>
                Provision a new Stronghold-managed Minecraft server.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <form
                className="grid gap-4 md:grid-cols-2"
                id="create-server-form"
                onSubmit={handleSubmit(onCreateServer)}
              >
                {createError && (
                  <Alert className="md:col-span-2" variant="error">
                    <CircleAlertIcon />
                    <AlertTitle>Create failed</AlertTitle>
                    <AlertDescription>{createError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="server-name">Server Name</Label>
                  <Input
                    {...register("name")}
                    aria-invalid={errors.name ? true : undefined}
                    id="server-name"
                    placeholder="Survival Realm"
                  />
                  {errors.name?.message && (
                    <p className="text-destructive text-sm">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="server-motd">MOTD</Label>
                  <Input
                    {...register("motd")}
                    aria-invalid={errors.motd ? true : undefined}
                    id="server-motd"
                  />
                  {errors.motd?.message && (
                    <p className="text-destructive text-sm">{errors.motd.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="server-port">Host Port</Label>
                  <Input
                    {...register("hostPort")}
                    aria-invalid={errors.hostPort ? true : undefined}
                    id="server-port"
                    type="number"
                  />
                  {errors.hostPort?.message && (
                    <p className="text-destructive text-sm">{errors.hostPort.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="server-memory">Memory</Label>
                  <Input
                    {...register("memory")}
                    aria-invalid={errors.memory ? true : undefined}
                    id="server-memory"
                    placeholder="2G"
                  />
                  {errors.memory?.message && (
                    <p className="text-destructive text-sm">{errors.memory.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Software</Label>
                  <Controller
                    control={control}
                    name="softwareType"
                    render={({ field }) => (
                      <Select
                        onValueChange={(value) => {
                          setCreateError(null);
                          field.onChange(value);
                        }}
                        value={field.value}
                      >
                        <SelectTrigger aria-invalid={errors.softwareType ? true : undefined}>
                          <SelectValue
                            placeholder={isLoadingSoftware ? "Loading software" : "Select software"}
                          />
                        </SelectTrigger>
                        <SelectPopup>
                          {softwareOptions.map((software) => (
                            <SelectItem key={software} value={software}>
                              {software}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    )}
                  />
                  {errors.softwareType?.message && (
                    <p className="text-destructive text-sm">{errors.softwareType.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Minecraft Version</Label>
                  <Controller
                    control={control}
                    name="minecraftVersion"
                    render={({ field }) => (
                      <Select
                        onValueChange={(value) => {
                          setCreateError(null);
                          field.onChange(value);
                        }}
                        value={field.value}
                      >
                        <SelectTrigger aria-invalid={errors.minecraftVersion ? true : undefined}>
                          <SelectValue
                            placeholder={isLoadingVersions ? "Loading versions" : "Select version"}
                          />
                        </SelectTrigger>
                        <SelectPopup>
                          {versionOptions.map((version) => (
                            <SelectItem key={version} value={version}>
                              {version}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    )}
                  />
                  {errors.minecraftVersion?.message && (
                    <p className="text-destructive text-sm">{errors.minecraftVersion.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="server-players">Max Players</Label>
                  <Input
                    {...register("maxPlayers")}
                    aria-invalid={errors.maxPlayers ? true : undefined}
                    id="server-players"
                    type="number"
                  />
                  {errors.maxPlayers?.message && (
                    <p className="text-destructive text-sm">{errors.maxPlayers.message}</p>
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="server-image">Docker Image</Label>
                  <Input
                    {...register("image")}
                    aria-invalid={errors.image ? true : undefined}
                    id="server-image"
                  />
                  {errors.image?.message && (
                    <p className="text-destructive text-sm">{errors.image.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Controller
                    control={control}
                    name="autoStart"
                    render={({ field }) => (
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                  <div>
                    <p className="font-medium text-sm">Auto start</p>
                    <p className="text-muted-foreground text-xs">
                      Start the server after provisioning.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Controller
                    control={control}
                    name="onlineMode"
                    render={({ field }) => (
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                  <div>
                    <p className="font-medium text-sm">Online mode</p>
                    <p className="text-muted-foreground text-xs">
                      Enforce authenticated Mojang sessions.
                    </p>
                  </div>
                </div>
              </form>
            </DialogPanel>
            <DialogFooter>
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  setCreateError(null);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={isLoadingSoftware || isLoadingVersions}
                form="create-server-form"
                loading={isSubmitting}
                type="submit"
              >
                {(isLoadingSoftware || isLoadingVersions) && (
                  <LoaderCircleIcon className="animate-spin" />
                )}
                Create Server
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
      <div className={"px-4 md:px-6"}>
        {sortedServers.length === 0 ? (
          <Card className={"border-dashed "}>
            <CardContent className="p-0 border-none">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HardDriveIcon />
                  </EmptyMedia>
                  <EmptyTitle>No Servers Yet</EmptyTitle>
                  <EmptyDescription>
                    Create your first managed server to start using the Stronghold control surface.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setDialogOpen(true)} type="button">
                    <PlusIcon />
                    Create Your First Server
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {sortedServers.map((server) => (
              <Link key={server.id} to={`/${server.id}`} className="block">
                <Card className={"hover:border-neutral-400"}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <CardTitle className="text-lg leading-tight truncate">
                                {server.name}
                              </CardTitle>
                              <Badge variant={getStatusVariant(server.status)} className="shrink-0">
                                {server.status}
                              </Badge>
                            </div>
                            <CardDescription className="mt-1 text-sm">
                              {server.serverPlatform} • {server.softwareType} • MC{" "}
                              {server.minecraftVersion}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-8 shrink-0">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest">
                            Port
                          </p>
                          <p className="font-medium text-base mt-0.5">{server.hostPort}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest">
                            Memory
                          </p>
                          <p className="font-medium text-base mt-0.5">{server.memory}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {server.statusMessage && (
                          <p className="hidden sm:block text-xs text-muted-foreground max-w-45 line-clamp-2">
                            {server.statusMessage}
                          </p>
                        )}
                        <Button className="px-6">Manage</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

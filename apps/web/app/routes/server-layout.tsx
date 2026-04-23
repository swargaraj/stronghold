import type { Route } from "./+types/server-layout";
import {
  BlocksIcon,
  CloudIcon,
  EarthIcon,
  EthernetPortIcon,
  FileClockIcon,
  FolderIcon,
  LayoutDashboardIcon,
  PlugIcon,
  SlidersHorizontalIcon,
  TerminalSquareIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, redirect } from "react-router";

import { AppSidebar } from "~/components/app-sidebar";
import { ApiError, api } from "~/lib/api";
import { clearStoredConnection, getStoredConnection } from "~/lib/auth";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";

type ApiServer = {
  id: string;
  name: string;
  status: string;
  minecraftVersion: string;
  hostPort: number;
};

const navItems = [
  {
    exact: true,
    icon: <LayoutDashboardIcon />,
    title: "Overview",
    url: "",
  },
  {
    icon: <SlidersHorizontalIcon />,
    title: "Options",
    url: "options",
  },
  {
    icon: <TerminalSquareIcon />,
    title: "Console",
    url: "console",
  },
  {
    icon: <FileClockIcon />,
    title: "Logs",
    url: "logs",
  },
  {
    icon: <UsersIcon />,
    title: "Players",
    url: "players",
  },
  {
    icon: <BlocksIcon />,
    title: "Software",
    url: "software",
  },
  {
    icon: <PlugIcon />,
    title: "Plugins",
    url: "plugins",
  },
  {
    icon: <FolderIcon />,
    title: "Files",
    url: "files",
  },
  {
    icon: <EarthIcon />,
    title: "Worlds",
    url: "worlds",
  },
  {
    icon: <EthernetPortIcon />,
    title: "Network",
    url: "network",
  },
  {
    icon: <CloudIcon />,
    title: "Backup",
    url: "backup",
  },
] as const;

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

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const connection = getStoredConnection();

  if (!connection) {
    clearStoredConnection();
    throw redirect("/login");
  }

  try {
    const [server, servers] = await Promise.all([
      api.query<ApiServer>("servers.get", {
        ...connection,
        input: { id: params.serverId },
      }),
      api.query<ApiServer[]>("servers.list", connection),
    ]);

    return {
      connection,
      server,
      servers,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw redirect("/");
    }

    throw error;
  }
}

clientLoader.hydrate = true as const;

export default function ServerLayout({ loaderData }: Route.ComponentProps) {
  const { connection } = loaderData;
  const [server, setServer] = useState(loaderData.server);
  const [servers, setServers] = useState(loaderData.servers);

  useEffect(() => {
    setServer(loaderData.server);
    setServers(loaderData.servers);
  }, [loaderData.server, loaderData.servers]);

  useEffect(() => {
    let isActive = true;

    async function refreshServers() {
      try {
        const [nextServer, nextServers] = await Promise.all([
          api.query<ApiServer>("servers.get", {
            ...connection,
            input: { id: server.id },
          }),
          api.query<ApiServer[]>("servers.list", connection),
        ]);

        if (!isActive) {
          return;
        }

        setServer(nextServer);
        setServers(nextServers);
      } catch {
        // Keep the last successful server snapshot if refresh fails.
      }
    }

    const timer = window.setInterval(() => {
      void refreshServers();
    }, 10000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [connection, server.id]);

  const otherServers = servers
    .filter((candidate) => candidate.id !== server.id)
    .slice(0, 5)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      status: candidate.status,
    }));

  return (
    <SidebarProvider>
      <AppSidebar
        activeServer={{
          id: server.id,
          name: server.name,
          status: server.status,
        }}
        endpoint={connection.endpoint}
        items={navItems.map((item) => ({
          ...item,
          url: item.url ? `/${server.id}/${item.url}` : `/${server.id}`,
        }))}
        onLogout={() => {
          clearStoredConnection();
          window.location.assign("/login");
        }}
        otherServers={otherServers}
        subtitle={server.status}
        title={server.name}
        variant="inset"
      />
      <SidebarInset className="min-h-screen">
        <header className="top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur rounded-md">
          <SidebarTrigger />
          <Separator className="mx-1 h-5" orientation="vertical" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-sm">{server.name}</p>
            <p className="truncate text-muted-foreground text-xs">
              Minecraft {server.minecraftVersion} on port {server.hostPort}
            </p>
          </div>
          <Badge variant={getStatusVariant(server.status)}>{server.status}</Badge>
        </header>
        <div key={server.id} className="flex flex-1 flex-col p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

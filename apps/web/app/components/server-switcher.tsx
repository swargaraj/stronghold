"use client";

import { Link } from "react-router";
import { ChevronsUpDownIcon, ServerIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";

type ServerSummary = {
  id: string;
  name: string;
  status: string;
};

export function ServerSwitcher({
  activeServer,
  otherServers,
}: {
  activeServer: ServerSummary;
  otherServers: ServerSummary[];
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{activeServer.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">Current server</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-64 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Current server
              </DropdownMenuLabel>
              <DropdownMenuItem className="gap-3 p-2">
                <div className="flex size-7 items-center justify-center rounded-md border">
                  <ServerIcon className="size-4" />
                </div>
                <div className="grid flex-1">
                  <span className="truncate font-medium">{activeServer.name}</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {otherServers.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Switch server
                  </DropdownMenuLabel>
                  {otherServers.slice(0, 5).map((server) => (
                    <DropdownMenuItem
                      key={server.id}
                      className="gap-3 p-2"
                      render={<Link to={`/${server.id}`} />}
                    >
                      <div className="flex size-7 items-center justify-center rounded-md border">
                        <ServerIcon className="size-4" />
                      </div>
                      <div className="grid flex-1">
                        <span className="truncate font-medium">{server.name}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

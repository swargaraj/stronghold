"use client";

import * as React from "react";
import { NavLink, useLocation } from "react-router";

import { NavMain } from "~/components/nav-main";
import { NavSession } from "~/components/nav-session";
import { ServerSwitcher } from "~/components/server-switcher";
import { cn } from "~/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
} from "~/components/ui/sidebar";
import { ArrowLeftIcon } from "lucide-react";

export function AppSidebar({
  endpoint,
  onLogout,
  items,
  activeServer,
  otherServers,
  className,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  endpoint: string;
  onLogout: () => void;
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
    exact?: boolean;
  }[];
  activeServer: {
    id: string;
    name: string;
    status: string;
  };
  otherServers: {
    id: string;
    name: string;
    status: string;
  }[];
  title: string;
  subtitle: string;
}) {
  const location = useLocation();
  const data = {
    navMain: items.map((item) => {
      const isExactMatch = location.pathname === item.url;
      const isNestedMatch = !item.exact && location.pathname.startsWith(`${item.url}/`);
      return {
        ...item,
        isActive: isExactMatch || isNestedMatch,
      };
    }),
    session: {
      name: "Session",
      endpoint: endpoint,
    },
  };

  return (
    <Sidebar className={cn("dark", className)} collapsible="icon" {...props}>
      <SidebarHeader>
        <ServerSwitcher activeServer={activeServer} otherServers={otherServers} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavLink end to={"/"}>
          <SidebarMenuButton>
            <ArrowLeftIcon />
            <span>All Servers</span>
          </SidebarMenuButton>
        </NavLink>
        <NavSession
          onLogout={onLogout}
          session={{
            endpoint,
            name: "Session",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

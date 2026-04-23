import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  layout("routes/protected-layout.tsx", [
    index("routes/dashboard.tsx"),
    route(":serverId", "routes/server-layout.tsx", [
      index("routes/server-overview.tsx"),
      route("settings", "routes/server-settings.tsx"),
      route("console", "routes/server-console.tsx"),
      route("players", "routes/server-players.tsx"),
      route("software", "routes/server-software.tsx"),
      route("files", "routes/server-files.tsx"),
      route("worlds", "routes/server-worlds.tsx"),
      route("network", "routes/server-network.tsx"),
      route("backup", "routes/server-backup.tsx"),
    ]),
  ]),
] satisfies RouteConfig;

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const servers = sqliteTable(
  "servers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    containerName: text("container_name").notNull().unique(),
    containerId: text("container_id"),
    image: text("image").notNull().default("itzg/minecraft-server:latest"),
    status: text("status", {
      enum: [
        "creating",
        "created",
        "starting",
        "running",
        "stopping",
        "stopped",
        "restarting",
        "killing",
        "killed",
        "deleting",
        "missing",
        "error",
      ],
    })
      .notNull()
      .default("created"),
    statusMessage: text("status_message"),
    hostPort: integer("host_port").notNull(),
    containerPort: integer("container_port").notNull().default(25565),
    portsJson: text("ports_json").notNull().default("[]"),
    volumeName: text("volume_name").notNull(),
    memory: text("memory").notNull().default("2G"),
    serverType: text("server_type").notNull().default("VANILLA"),
    minecraftVersion: text("minecraft_version").notNull().default("LATEST"),
    motd: text("motd").notNull().default("A Stronghold Minecraft Server"),
    maxPlayers: integer("max_players").notNull().default(20),
    difficulty: text("difficulty").notNull().default("easy"),
    gameMode: text("game_mode").notNull().default("survival"),
    onlineMode: integer("online_mode", { mode: "boolean" }).notNull().default(true),
    enableRcon: integer("enable_rcon", { mode: "boolean" }).notNull().default(true),
    rconPassword: text("rcon_password").notNull(),
    extraEnvJson: text("extra_env_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("servers_status_idx").on(table.status),
    index("servers_container_name_idx").on(table.containerName),
  ],
);

export const serverStats = sqliteTable(
  "server_stats",
  {
    id: text("id").primaryKey(),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    cpuPercent: integer("cpu_percent"),
    memoryUsageBytes: integer("memory_usage_bytes"),
    memoryLimitBytes: integer("memory_limit_bytes"),
    memoryPercent: integer("memory_percent"),
    diskUsageBytes: integer("disk_usage_bytes"),
    playersOnline: integer("players_online"),
    playerNamesJson: text("player_names_json").notNull().default("[]"),
    networkRxBytes: integer("network_rx_bytes"),
    networkTxBytes: integer("network_tx_bytes"),
    blockReadBytes: integer("block_read_bytes"),
    blockWriteBytes: integer("block_write_bytes"),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("server_stats_server_id_idx").on(table.serverId),
    index("server_stats_recorded_at_idx").on(table.recordedAt),
  ],
);

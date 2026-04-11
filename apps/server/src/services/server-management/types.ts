import type { serverStats, servers } from "@stronghold/db/schema";
import type { PortMapping } from "./schemas";

export type Server = typeof servers.$inferSelect;
export type ServerStat = typeof serverStats.$inferSelect;
export type ServerStatus = Server["status"];

export type DockerState = {
  Status?: string;
  Running?: boolean;
  Error?: string;
};

export type ApiServer = Omit<Server, "extraEnvJson" | "portsJson"> & {
  extraEnv: Record<string, string>;
  ports: PortMapping[];
  serverPlatform: "JAVA" | "BEDROCK";
  softwareType: "VANILLA" | "PAPER";
};

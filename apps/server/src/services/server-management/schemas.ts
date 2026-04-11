import { z } from "zod";

import { javaSoftwareOptions, serverPlatformOptions } from "./catalog";

const defaultImage = "itzg/minecraft-server:latest";
const memoryPattern = /^([1-9]\d*)(M|G)$/i;
const dockerImagePattern =
  /^(?:[a-z0-9]+(?:(?:[._-]|__|[-]*)[a-z0-9]+)*(?::[0-9]+)?\/)?[a-z0-9]+(?:(?:[._-]|__|[-]*)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._-]|__|[-]*)[a-z0-9]+)*)*(?::[\w][\w.-]{0,127})?$/;
const versionPattern = /^(LATEST|SNAPSHOT|PREVIEW|\d+\.\d+(?:\.\d+)?)$/;
const managedEnvKeys = new Set([
  "DIFFICULTY",
  "ENABLE_RCON",
  "EULA",
  "MAX_PLAYERS",
  "MEMORY",
  "MODE",
  "MOTD",
  "ONLINE_MODE",
  "RCON_PASSWORD",
  "SERVER_PORT",
  "TYPE",
  "VERSION",
]);
const portNumberSchema = z.number().int().min(1024).max(65535);

function memoryToMegabytes(value: string) {
  const match = memoryPattern.exec(value);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();

  return unit === "G" ? amount * 1024 : amount;
}

const memorySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(memoryPattern, "Memory must use M or G, for example 1024M or 2G")
  .refine((value) => {
    const megabytes = memoryToMegabytes(value);
    return megabytes !== null && megabytes >= 512 && megabytes <= 32768;
  }, "Memory must be between 512M and 32G");

const serverTypeSchema = z
  .enum([
    "VANILLA",
    "BEDROCK",
    "PAPER",
    "FABRIC",
    "FORGE",
    "NEOFORGE",
    "SPIGOT",
    "BUKKIT",
    "PURPUR",
    "QUILT",
  ])
  .default("VANILLA");

export const serverPlatformSchema = z.enum(serverPlatformOptions).default("JAVA");

export const softwareTypeSchema = z.enum(javaSoftwareOptions).default("VANILLA");

export const extraEnvSchema = z.record(
  z.string().min(1).regex(/^[A-Z0-9_]+$/),
  z.string().max(500),
).superRefine((value, context) => {
  for (const key of Object.keys(value)) {
    if (managedEnvKeys.has(key)) {
      context.addIssue({
        code: "custom",
        message: `${key} is managed by Stronghold and cannot be set in extraEnv`,
        path: [key],
      });
    }
  }
});

export const portProtocolSchema = z.enum(["tcp", "udp"]).default("tcp");

export const portExposureSchema = z.enum(["public", "localhost", "internal"]).default("public");

export const portMappingSchema = z
  .object({
    hostPort: portNumberSchema.optional(),
    containerPort: portNumberSchema,
    protocol: portProtocolSchema,
    exposure: portExposureSchema,
  })
  .superRefine((value, context) => {
    if (value.exposure === "internal" && value.hostPort !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Internal-only ports cannot set a hostPort",
        path: ["hostPort"],
      });
    }

    if (value.exposure !== "internal" && value.hostPort === undefined) {
      context.addIssue({
        code: "custom",
        message: "Exposed ports must set a hostPort",
        path: ["hostPort"],
      });
    }
  });

export const portsSchema = z
  .array(portMappingSchema)
  .min(1, "At least one port mapping is required")
  .max(32, "Too many port mappings")
  .superRefine((value, context) => {
    const seenContainerPorts = new Set<string>();
    const seenHostPorts = new Set<string>();

    value.forEach((mapping, index) => {
      const containerKey = `${mapping.protocol}:${mapping.containerPort}`;

      if (seenContainerPorts.has(containerKey)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate container port mapping",
          path: [index, "containerPort"],
        });
      } else {
        seenContainerPorts.add(containerKey);
      }

      if (mapping.hostPort !== undefined) {
        const hostKey = `${mapping.protocol}:${mapping.hostPort}`;

        if (seenHostPorts.has(hostKey)) {
          context.addIssue({
            code: "custom",
            message: "Duplicate host port mapping",
            path: [index, "hostPort"],
          });
        } else {
          seenHostPorts.add(hostKey);
        }
      }
    });
  });

const serverConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  image: z.string().trim().regex(dockerImagePattern, "Invalid Docker image reference").default(defaultImage),
  hostPort: portNumberSchema,
  containerPort: portNumberSchema.default(25565),
  ports: portsSchema.optional(),
  memory: memorySchema.default("2G"),
  serverPlatform: serverPlatformSchema,
  softwareType: softwareTypeSchema.optional(),
  serverType: serverTypeSchema.optional(),
  minecraftVersion: z
    .string()
    .trim()
    .toUpperCase()
    .regex(versionPattern, "Use LATEST, SNAPSHOT, PREVIEW, or a version like 1.21.4")
    .default("LATEST"),
  motd: z.string().trim().min(1).max(120).default("A Stronghold Minecraft Server"),
  maxPlayers: z.number().int().min(1).max(500).default(20),
  difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).default("easy"),
  gameMode: z.enum(["survival", "creative", "adventure", "spectator"]).default("survival"),
  onlineMode: z.boolean().default(true),
  rconPassword: z.string().trim().min(16).max(128),
  extraEnv: extraEnvSchema.default({}),
});

export const createServerSchema = serverConfigSchema.extend({
  autoStart: z.boolean().default(true),
});

export const updateServerSchema = serverConfigSchema
  .omit({ hostPort: true, ports: true })
  .partial()
  .extend({
    id: z.string().min(1),
    hostPort: portNumberSchema.optional(),
    ports: portsSchema.optional(),
    recreateContainer: z.boolean().default(true),
  });

export const serverIdSchema = z.object({
  id: z.string().min(1),
});

export const serverStatsHistorySchema = serverIdSchema.extend({
  limit: z.number().int().min(1).max(500).default(100),
});

export const exposeServerPortsSchema = z.object({
  id: z.string().min(1),
  ports: portsSchema,
  recreateContainer: z.boolean().default(true),
});

export const unexposeServerPortsSchema = z.object({
  id: z.string().min(1),
  ports: z
    .array(
      z.object({
        containerPort: portNumberSchema,
        protocol: portProtocolSchema.default("tcp"),
      }),
    )
    .min(1)
    .max(32),
  recreateContainer: z.boolean().default(true),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type ExposeServerPortsInput = z.infer<typeof exposeServerPortsSchema>;
export type PortExposure = z.infer<typeof portExposureSchema>;
export type PortMapping = z.infer<typeof portMappingSchema>;
export type PortProtocol = z.infer<typeof portProtocolSchema>;
export type ServerStatsHistoryInput = z.infer<typeof serverStatsHistorySchema>;
export type UnexposeServerPortsInput = z.infer<typeof unexposeServerPortsSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;

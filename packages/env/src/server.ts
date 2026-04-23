import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_TOKEN: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    MAX_WS_CONNECTIONS: z.number().default(100),
    MONITOR_INTERVAL_MS: z.number().int().default(30_000),
    STATS_RETENTION_MS: z
      .number()
      .int()
      .default(24 * 60 * 60 * 1000),
    STATS_PULL_TIMEOUT: z.number().int().default(10_000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

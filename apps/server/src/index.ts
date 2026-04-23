import { Elysia } from "elysia";
import { env } from "@stronghold/env/server";
import cors from "@elysiajs/cors";

import { trpcRoutes } from "@/routers/trpc";
import { metaRoutes } from "@/routers/meta";
import { logsRoutes } from "@/routers/logs";

import { startServerMonitor } from "@/workers/server-monitor";
import { logger } from "@/lib/logger";

startServerMonitor();

new Elysia()
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
    }),
  )
  .use(trpcRoutes)
  .use(logsRoutes)
  .use(metaRoutes)
  .get("/", () => "OK")
  .listen(3000, () => {
    logger.info("Stronghold API Server is running on port 3000");
  });

import { publicProcedure, router } from "@stronghold/api";

import { serversRouter } from "./servers";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  servers: serversRouter,
});

export type AppRouter = typeof appRouter;

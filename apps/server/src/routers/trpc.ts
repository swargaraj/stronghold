import { Elysia } from "elysia";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "@/routers";
import { createContext } from "@stronghold/api/context";
import { env } from "@stronghold/env/server";

export const trpcRoutes = new Elysia().all("/trpc/*", async (context) => {
  const token = context.request.headers.get("auth");

  if (token !== env.AUTH_TOKEN) {
    return new Response("FORBIDDEN", { status: 403 });
  }

  return fetchRequestHandler({
    endpoint: "/trpc",
    router: appRouter,
    req: context.request,
    createContext: () => createContext({ context }),
  });
});

import { cors } from "@elysiajs/cors";
import { createContext } from "@stronghold/api/context";
import { env } from "@stronghold/env/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Elysia } from "elysia";

import { appRouter } from "./routers";
import { metaRoutes } from "./routers/meta";
import { startServerMonitor } from "./workers/server-monitor";

startServerMonitor();

function isAuthorized(request: Request) {
  const token = request.headers.get("auth");
  return token === env.AUTH_TOKEN;
}

new Elysia()
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
    }),
  )
  .all("/trpc/*", async (context) => {
    if (!isAuthorized(context.request)) {
      return new Response("FORBIDDEN", { status: 403 });
    }

    return await fetchRequestHandler({
      endpoint: "/trpc",
      router: appRouter,
      req: context.request,
      createContext: () => createContext({ context }),
    });
  })
  .use(metaRoutes)
  .get("/", () => "OK")
  .listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });

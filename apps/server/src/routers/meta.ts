import { Elysia } from "elysia";

import {
  isSupportedServerPlatform,
  isSupportedSoftware,
  isSupportedVersionType,
  listSoftware,
  listVersions,
  serverPlatformOptions,
} from "../services/servers";

function badRequest(message: string) {
  return new Response(JSON.stringify({ message }), {
    status: 400,
    headers: {
      "content-type": "application/json",
    },
  });
}

export const metaRoutes = new Elysia({ prefix: "/meta" })
  .get("/server-types", () => {
    return {
      serverTypes: [...serverPlatformOptions],
    };
  })
  .get("/software", ({ query }) => {
    const serverType = typeof query.serverType === "string" ? query.serverType.toUpperCase() : "JAVA";

    if (!isSupportedServerPlatform(serverType)) {
      return badRequest("Unsupported serverType");
    }

    return {
      serverType,
      software: listSoftware(serverType),
    };
  })
  .get("/software/:software/versions", async ({ params, query, set }) => {
    const software = params.software.toUpperCase();
    const serverType = typeof query.serverType === "string" ? query.serverType.toUpperCase() : "JAVA";
    const versionType = typeof query.versionType === "string" ? query.versionType.toUpperCase() : "RELEASE";

    if (!isSupportedServerPlatform(serverType)) {
      return badRequest("Unsupported serverType");
    }

    if (!isSupportedSoftware(serverType, software)) {
      return badRequest("Unsupported software");
    }

    if (!isSupportedVersionType(versionType)) {
      return badRequest("Unsupported versionType");
    }

    try {
      const versions = await listVersions(serverType, software, versionType);

      return {
        serverType,
        software,
        versionType,
        versions,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unsupported")) {
        return badRequest(error.message);
      }

      set.status = 502;

      return {
        message: error instanceof Error ? error.message : "Failed to fetch available versions",
      };
    }
  });

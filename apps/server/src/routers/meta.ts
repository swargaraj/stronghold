import { Elysia } from "elysia";

import {
  isSupportedSoftware,
  listSoftware,
  listVersions,
} from "@/services/servers";
import { badRequest } from "@/lib/utils";
import { logger } from "@/lib/logger";

export const metaRoutes = new Elysia({ prefix: "/meta" })
  .get("/software", () => {
    return {
      software: listSoftware(),
    };
  })

  .get("/software/:software/versions", async ({ params, set }) => {
    const software = params.software.toUpperCase();
    if (!isSupportedSoftware(software)) {
      return badRequest(`Unsupported serverType: ${software}`);
    }

    try {
      const versions = await listVersions(software);

      return {
        software,
        versions,
      };
    } catch (error) {
      logger.error("Failed to fetch versions:", error);

      set.status = 502;
      return {
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch available versions",
      };
    }
  });

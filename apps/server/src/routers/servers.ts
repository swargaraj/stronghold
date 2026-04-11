import { publicProcedure, router } from "@stronghold/api";
import {
  createServerSchema,
  exposeServerPortsSchema,
  getServerDetails,
  getServerStatsHistory,
  serverIdSchema,
  serverService,
  serverStatsHistorySchema,
  unexposeServerPortsSchema,
  updateServerSchema,
} from "../services/servers";

export const serversRouter = router({
  list: publicProcedure.query(() => {
    return serverService.list();
  }),

  get: publicProcedure.input(serverIdSchema).query(({ input }) => {
    return serverService.get(input.id);
  }),

  details: publicProcedure.input(serverIdSchema).query(({ input }) => {
    return getServerDetails(input.id);
  }),

  stats: publicProcedure.input(serverStatsHistorySchema).query(({ input }) => {
    return getServerStatsHistory(input);
  }),

  create: publicProcedure.input(createServerSchema).mutation(({ input }) => {
    return serverService.create(input);
  }),

  update: publicProcedure.input(updateServerSchema).mutation(({ input }) => {
    return serverService.update(input);
  }),

  exposePorts: publicProcedure.input(exposeServerPortsSchema).mutation(({ input }) => {
    return serverService.exposePorts(input);
  }),

  unexposePorts: publicProcedure.input(unexposeServerPortsSchema).mutation(({ input }) => {
    return serverService.unexposePorts(input);
  }),

  start: publicProcedure.input(serverIdSchema).mutation(({ input }) => {
    return serverService.start(input.id);
  }),

  stop: publicProcedure.input(serverIdSchema).mutation(({ input }) => {
    return serverService.stop(input.id);
  }),

  restart: publicProcedure.input(serverIdSchema).mutation(({ input }) => {
    return serverService.restart(input.id);
  }),

  kill: publicProcedure.input(serverIdSchema).mutation(({ input }) => {
    return serverService.kill(input.id);
  }),

  delete: publicProcedure.input(serverIdSchema).mutation(({ input }) => {
    return serverService.delete(input.id);
  }),
});

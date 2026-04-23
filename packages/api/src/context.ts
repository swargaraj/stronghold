import type { Context as ElysiaContext } from "elysia";

export type CreateContextOptions = {
  context: ElysiaContext;
};

export async function createContext({ context: _context }: CreateContextOptions) {
  return {};
}

export type Context = Awaited<ReturnType<typeof createContext>>;

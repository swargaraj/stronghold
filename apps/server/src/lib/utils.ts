import { env } from "@stronghold/env/server";

export function isAuthorizedToken(token: string | null) {
  return token === env.AUTH_TOKEN;
}

export function badRequest(message: string) {
  return new Response(JSON.stringify({ message }), {
    status: 400,
    headers: {
      "content-type": "application/json",
    },
  });
}

export class ApiError extends Error {
  public readonly status?: number;

  public constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface TrpcSuccess<TData> {
  result?: {
    data?: TData;
  };
}

interface TrpcFailureShape {
  error?: {
    code?: number;
    message?: string;
    data?: {
      code?: string;
      httpStatus?: number;
    };
  };
}

interface ApiRequestOptions {
  endpoint: string;
  token: string;
  method?: "GET" | "POST";
  input?: unknown;
}

interface MetaRequestOptions {
  endpoint: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildErrorMessage(payload: TrpcFailureShape | undefined, status: number) {
  const trpcMessage = payload?.error?.message?.trim();

  if (trpcMessage) {
    return trpcMessage;
  }

  if (status === 403) {
    return "Check the auth token and try again.";
  }

  return "The server request failed. Check the API endpoint and try again.";
}

export function normalizeApiEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

export function buildWebSocketUrl(endpoint: string, path: string, query?: Record<string, string>) {
  const normalizedEndpoint = normalizeApiEndpoint(endpoint);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedEndpoint}${normalizedPath}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function parseJsonResponse<TData>(response: Response): Promise<TData> {
  const raw = await response.text();

  if (!raw) {
    throw new ApiError("The server returned an empty response.", response.status);
  }

  let payload: unknown;

  try {
    payload = JSON.parse(raw) as TData | TrpcFailureShape | { message?: string };
  } catch {
    throw new ApiError("The server returned an invalid response body.", response.status);
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : buildErrorMessage(payload as TrpcFailureShape | undefined, response.status);

    throw new ApiError(message, response.status);
  }

  return payload as TData;
}

async function parseResponse<TData>(response: Response): Promise<TData> {
  const raw = await response.text();
  let payload: (TrpcSuccess<TData> & TrpcFailureShape) | undefined;

  if (raw) {
    try {
      payload = JSON.parse(raw) as TrpcSuccess<TData> & TrpcFailureShape;
    } catch {
      if (!response.ok) {
        throw new ApiError(buildErrorMessage(undefined, response.status), response.status);
      }

      throw new ApiError("The server returned an invalid response body.", response.status);
    }
  }

  if (!response.ok) {
    throw new ApiError(buildErrorMessage(payload, response.status), response.status);
  }

  if (payload?.error) {
    throw new ApiError(buildErrorMessage(payload, response.status), response.status);
  }

  if (typeof payload?.result?.data === "undefined") {
    throw new ApiError("The server returned an invalid tRPC response.", response.status);
  }

  return payload.result.data;
}

async function request<TData>(
  procedure: string,
  { endpoint, token, method = "GET", input }: ApiRequestOptions,
): Promise<TData> {
  const normalizedEndpoint = normalizeApiEndpoint(endpoint);
  const url = new URL(`${normalizedEndpoint}/trpc/${procedure}`);

  if (typeof input !== "undefined" && method === "GET") {
    url.searchParams.set("input", JSON.stringify(input));
  }

  const response = await fetch(url, {
    body: method === "POST" && typeof input !== "undefined" ? JSON.stringify(input) : undefined,
    headers: {
      Accept: "application/json",
      Auth: token.trim(),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    method,
  });

  return parseResponse<TData>(response);
}

export const api = {
  async meta<TData>({ endpoint, path, query }: MetaRequestOptions) {
    const normalizedEndpoint = normalizeApiEndpoint(endpoint);
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${normalizedEndpoint}${normalizedPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (typeof value !== "undefined") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      method: "GET",
    });

    return parseJsonResponse<TData>(response);
  },
  mutation<TData>(procedure: string, options: ApiRequestOptions) {
    return request<TData>(procedure, {
      ...options,
      method: "POST",
    });
  },
  query<TData>(procedure: string, options: ApiRequestOptions) {
    return request<TData>(procedure, {
      ...options,
      method: "GET",
    });
  },
};

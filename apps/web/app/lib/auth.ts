export const STORAGE_KEY = "stronghold.panel.connection";

export interface StoredConnection {
  endpoint: string;
  token: string;
}

function isValidConnection(value: unknown): value is StoredConnection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredConnection>;

  return (
    typeof candidate.endpoint === "string" &&
    candidate.endpoint.trim().length > 0 &&
    typeof candidate.token === "string" &&
    candidate.token.trim().length > 0
  );
}

export function clearStoredConnection() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getStoredConnection(): StoredConnection | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isValidConnection(parsed)) {
      clearStoredConnection();
      return null;
    }

    return {
      endpoint: parsed.endpoint.trim(),
      token: parsed.token.trim(),
    };
  } catch {
    clearStoredConnection();
    return null;
  }
}

export function saveStoredConnection(connection: StoredConnection) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      endpoint: connection.endpoint.trim(),
      token: connection.token.trim(),
    }),
  );
}

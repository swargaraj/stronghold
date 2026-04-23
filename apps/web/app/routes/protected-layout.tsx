import { Outlet, redirect } from "react-router";

import { clearStoredConnection, getStoredConnection } from "~/lib/auth";

export async function clientLoader() {
  const connection = getStoredConnection();

  if (!connection) {
    clearStoredConnection();
    throw redirect("/login");
  }

  return connection;
}

clientLoader.hydrate = true as const;

export default function ProtectedLayout() {
  return <Outlet />;
}

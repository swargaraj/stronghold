import type { Route } from "./+types/login";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { redirect } from "react-router";
import { CircleAlertIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api, normalizeApiEndpoint } from "~/lib/api";
import { clearStoredConnection, getStoredConnection, saveStoredConnection } from "~/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const connectionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1, "API endpoint is required.")
    .url("Enter a valid API endpoint URL."),
  token: z.string().trim().min(1, "Auth token is required."),
});

type ConnectionFormValues = z.infer<typeof connectionSchema>;

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Login | Stronghold Panel" },
    {
      name: "description",
      content: "Connect this Stronghold panel to your API server.",
    },
  ];
}

export async function clientLoader() {
  const connection = getStoredConnection();

  if (connection) {
    throw redirect("/");
  }

  clearStoredConnection();
  return null;
}

clientLoader.hydrate = true as const;

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<ConnectionFormValues>({
    defaultValues: {
      endpoint: "",
      token: "",
    },
    resolver: zodResolver(connectionSchema),
  });

  useEffect(() => {
    const storedConnection = getStoredConnection();

    if (!storedConnection) {
      return;
    }

    reset(storedConnection);
  }, [reset]);

  async function onSubmit(values: ConnectionFormValues) {
    const nextConfig = {
      endpoint: normalizeApiEndpoint(values.endpoint),
      token: values.token.trim(),
    };

    setError(null);
    setSuccess(null);

    try {
      await api.query<unknown[]>("servers.list", nextConfig);
      saveStoredConnection(nextConfig);
      reset(nextConfig);
      setSuccess("Connection verified and saved locally.");
      window.location.assign("/");
    } catch (cause) {
      clearStoredConnection();
      setError(
        cause instanceof Error ? cause.message : "Failed to connect to the Stronghold server.",
      );
      setSuccess(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Stronghold Login</CardTitle>
          <CardDescription>Connect this panel to your Stronghold API server.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <Alert variant="error">
                <CircleAlertIcon />
                <AlertTitle>Connection Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert variant="success">
                <AlertTitle>Connection Successful</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="endpoint">API Endpoint</Label>
              <Input
                {...register("endpoint", {
                  onChange: () => {
                    setError(null);
                    setSuccess(null);
                  },
                })}
                aria-invalid={errors.endpoint ? true : undefined}
                id="endpoint"
                placeholder="https://server.example.com"
                type="url"
              />
              {errors.endpoint?.message && (
                <p className="text-destructive text-sm">{errors.endpoint.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Auth Token</Label>
              <Input
                {...register("token", {
                  onChange: () => {
                    setError(null);
                    setSuccess(null);
                  },
                })}
                aria-invalid={errors.token ? true : undefined}
                id="token"
                placeholder="Paste Token"
                type="password"
              />
              {errors.token?.message && (
                <p className="text-destructive text-sm">{errors.token.message}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" loading={isSubmitting} type="submit">
                Start Connection
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

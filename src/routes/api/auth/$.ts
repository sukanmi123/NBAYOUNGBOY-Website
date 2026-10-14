import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

type Environment = {
  PAYMENTS_DB?: Parameters<typeof betterAuth>[0]["database"];
  BETTER_AUTH_SECRET?: string;
};
type WorkerRequest = Request & { runtime?: { cloudflare?: { env?: Environment } } };

async function authHandler({ request }: { request: Request }) {
  const workerRequest = getRequest() as WorkerRequest;
  const env = workerRequest.runtime?.cloudflare?.env;
  if (!env?.PAYMENTS_DB || !env.BETTER_AUTH_SECRET) {
    return Response.json({ message: "Authentication is not configured." }, { status: 503 });
  }
  const origin = new URL(request.url).origin;
  const auth = betterAuth({
    database: env.PAYMENTS_DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [
      "https://youngboy-shop.fredrickowoeye8.workers.dev",
      "https://youngboy-shop.vercel.app",
      "https://youngboy-never-broke-again.vercel.app",
      "https://nbayoungboy-addmin.vercel.app",
      "http://127.0.0.1:8787",
      "http://localhost:8787",
      "http://localhost:5173",
    ],
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    plugins: [admin(), username(), tanstackStartCookies()],
  });
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: authHandler,
      POST: authHandler,
    },
  },
});

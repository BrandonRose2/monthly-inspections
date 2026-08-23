// Vercel serverless entry point.
//
// The Manus template's server/_core/index.ts calls server.listen(), which does
// not work in a serverless runtime. This module wires up the same Express app
// and exports it as a request handler instead.
//
// Manus OAuth routes are still registered, but every tRPC procedure in
// server/routers.ts is a publicProcedure and createContext() tolerates a failed
// authentication, so the app is fully functional without the Manus OAuth server
// configured.
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";

const app = express();

// Matches the limits used by the original server for PDF uploads.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export default app;

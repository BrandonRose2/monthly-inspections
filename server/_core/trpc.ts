import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Machine-to-machine auth for automated ingest (the inspections scraper).
//
// The browser UI has no login, so its procedures stay public; this gate exists
// only for automated callers, which present a bearer token instead of a user
// session. INGEST_TOKEN must be set in the deployment environment.
export const machineProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const expected = process.env.INGEST_TOKEN;

    if (!expected) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "INGEST_TOKEN is not configured on the server",
      });
    }

    const header = ctx.req.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

    // Constant-length comparison to avoid leaking the token via timing.
    const ok =
      presented.length === expected.length &&
      presented.split("").reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0;

    if (!ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid ingest token" });
    }

    return next({ ctx });
  }),
);

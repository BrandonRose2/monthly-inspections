# Migrating a Manus app to Vercel

Derived from migrating `monthly-inspections`. Every gotcha listed here was hit
in practice, not anticipated.

Manus apps generated from the same template share one shape: a Vite client, an
Express + tRPC server, Drizzle over **MySQL**, Manus OAuth, and Manus "Forge"
object storage. The steps below assume that shape — verify first.

---

## Phase 0 — Assess (10 min)

```sh
gh repo clone BrandonRose2/<app> && cd <app>
ls                      # client/ + server/ + drizzle.config.ts => full stack
grep -c '"/api/' -r client/src | tail -1
python3 -c "import json;d=json.load(open('package.json'));print(d['scripts']['build'])"
grep -rn 'publicProcedure\|protectedProcedure' server/routers.ts | head
```

Decide:

- **Static only** (just `index.html` + assets)? GitHub Pages is enough — no
  migration needed. If Pages 404s while reporting "built", force a rebuild:
  `gh api -X POST repos/<owner>/<repo>/pages/builds`.
- **Full stack?** Continue.

Record the Manus couplings you will need to replace:

| Coupling | Look for | Replacement |
|---|---|---|
| Database | `drizzle-orm/mysql2`, `mysql2` | Neon Postgres |
| Object storage | `BUILT_IN_FORGE_API_*`, `storage.ts` | Vercel Blob |
| Auth | `OAUTH_SERVER_URL`, `sdk.authenticateRequest` | usually droppable |
| Build plugin | `vite-plugin-manus-runtime` | harmless, leave it |

**Check whether auth is actually enforced.** In our case every procedure was
`publicProcedure` and `createContext` swallowed auth failures, so dropping
Manus OAuth changed nothing. If real `protectedProcedure` routes exist, you
need an auth story before going live.

---

## Phase 1 — Vercel adapter

The template entry (`server/_core/index.ts`) calls `server.listen()`, which
cannot run in a serverless function.

1. `server/vercel-entry.ts` — build the same Express app (json body limits,
   storage proxy, OAuth routes, tRPC middleware at `/api/trpc`) and
   `export default app`.

2. Bundle it in `package.json`:

   ```
   "build": "vite build && esbuild ... && esbuild server/vercel-entry.ts --bundle --platform=node --format=esm --packages=external --outfile=api/index.mjs"
   ```

   `--packages=external` inlines your own relative imports while leaving npm
   packages as bare specifiers Node can resolve.

3. **Commit `api/index.mjs`.** Vercel detects functions from the *source* `api/`
   directory *before* running the build, so a generated-but-gitignored file
   means Git deploys register no function at all. The build overwrites it every
   time, so the committed copy cannot go stale.

4. `vercel.json`:

   ```json
   {
     "buildCommand": "pnpm run build",
     "outputDirectory": "dist/public",
     "rewrites": [
       { "source": "/api/trpc/:path*", "destination": "/api" },
       { "source": "/((?!api/|assets/).*)", "destination": "/index.html" }
     ]
   }
   ```

5. `.vercelignore` for anything that must not reach the build (e.g. a
   `scraper/` directory pulling in Puppeteer).

### Why not let Vercel compile `api/index.ts` directly?

Tried first; it fails. These projects are `"type": "module"` with
`moduleResolution: "bundler"`, so their relative imports have no file
extensions. Vercel's function compiler leaves them as raw ESM specifiers and
Node throws `ERR_MODULE_NOT_FOUND: /var/task/server/routers` at runtime.
Pre-bundling is the fix.

---

## Phase 2 — MySQL to Postgres

Vercel has no first-party MySQL. Porting is small if the schema is small.

| MySQL | Postgres |
|---|---|
| `mysqlTable` | `pgTable` |
| `int().autoincrement().primaryKey()` | `serial().primaryKey()` |
| `int()` | `integer()` |
| `mysqlEnum("x", [...])` | `pgEnum("x", [...])` declared at module level |
| `.onUpdateNow()` | `.$onUpdate(() => new Date())` (no SQL equivalent) |
| `drizzle-orm/mysql2` | `drizzle-orm/neon-http` |
| `.onDuplicateKeyUpdate({set})` | `.onConflictDoUpdate({target, set})` |
| `mysql2` | `@neondatabase/serverless` |
| `dialect: "mysql"` | `dialect: "postgresql"` |

`onConflictDoUpdate` needs a real unique constraint to target — confirm the
generated DDL has it.

Regenerate migrations (delete the MySQL `.sql` files and `meta/` first).
`drizzle.config.ts` throws without `DATABASE_URL` even for offline generation,
so pass a placeholder:

```sh
DATABASE_URL='postgresql://x:x@localhost:5432/x' npx drizzle-kit generate
```

Keep the schema MySQL-shaped only if you must import an existing MySQL dump.

---

## Phase 3 — Forge storage to Vercel Blob

```js
import { put } from "@vercel/blob";
const result = await put(pathname, body, {
  access: "public", contentType, addRandomSuffix: true,
});
return { key: result.url, url: result.url };
```

- `addRandomSuffix` preserves the unguessable-URL property Forge got from its
  manual hash suffix.
- Public Blob URLs need no signing — return the URL and store it directly in
  the DB column, so the client links straight to it.
- `@vercel/blob` rejects a bare `Uint8Array`; normalize to `Buffer` first.
- Point the old `/manus-storage/*` route at a `410` with an explanation rather
  than proxying to a backend that no longer exists.
- Audit the call sites. Ours returned the *pre-suffix* path as the key, so the
  stored key never matched the uploaded object — a latent bug that predated the
  migration.

---

## Phase 4 — Provision and deploy

```sh
cd ~/<app>          # NEVER run vercel link from your home directory
vercel link --yes
```

Running `vercel` from `$HOME` offers to deploy your entire home folder —
every `.env`, `.ssh`, and credential in it. Vercel prompts before doing it;
decline.

**Neon Postgres:** dashboard only — Storage tab → Create Database → Neon.
Installing a marketplace integration means accepting the vendor's legal terms,
which requires a human. It injects `DATABASE_URL` automatically.

**Vercel Blob:** CLI works, no third-party terms:

```sh
vercel blob create-store <app>-files --access public --yes
```

**Other env vars — set them non-interactively:**

```sh
printf '%s' "$VALUE" > /tmp/v && vercel env add MY_VAR production < /tmp/v && rm /tmp/v
```

The interactive prompt is a trap: its first question is "Store as sensitive?"
and the second is "Value?". Pasting the wrong thing silently stores a shell
command as your secret. Setting a token in two places (Vercel + GitHub) from
one file guarantees they match.

**Redeploy after every env change.** Vercel snapshots env vars at deploy time;
an existing deployment keeps the old values. This bites twice — once for the
database, once for every token.

**Create the tables.** If the integration marked `DATABASE_URL` sensitive,
`vercel env pull` returns the literal string `[SENSITIVE]` and `drizzle-kit`
fails on an unparseable URL. Either run the generated DDL in the Neon console,
or set a non-sensitive copy locally. Use the **unpooled** endpoint for DDL.

---

## Phase 5 — Verify

**Verify with a write, never a read.** A `getX` query returns `[]` both when
the table is empty and when the database is unreachable — identical output. A
mutation fails loudly:

```sh
curl -sS -X POST "$URL/api/trpc/<router>.<mutation>" \
  -H 'content-type: application/json' -d '{"json":{...}}'
```

Then read it back, then clean up the probe row.

Other things that will confuse you:

- **Vercel Security Checkpoint.** Rapid automated requests get a 403 with an
  HTML "Security Checkpoint" page. It is not your app breaking. Check in a
  browser before debugging.
- **Deployment-specific URLs** (`<app>-<hash>-<team>.vercel.app`) sit behind
  team auth. Use the clean alias.
- **Confirm the domain is yours.** Match the served asset hashes against your
  local build — generic names like `monthly-inspections.vercel.app` could
  belong to someone else.

---

## Phase 6 — Repoint anything that fed the old app

Automated jobs that pushed data into the Manus portal have its URL baked in.
Search for `manus.space` across your repos and dotfiles:

```sh
gh api -X GET search/code -f q='manus.space user:<you>' --jq '.items[].repository.name' | sort -u
grep -rl 'manus.space' ~/.config 2>/dev/null
```

For machine callers, add a token-gated procedure rather than opening the
public routes:

```ts
export const machineProcedure = t.procedure.use(t.middleware(async opts => {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const presented = (opts.ctx.req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (presented !== expected) throw new TRPCError({ code: "UNAUTHORIZED" });
  return opts.next(opts);
}));
```

Fail closed when the token is unset, and keep the browser UI's routes public
if the UI has no login — otherwise you break the app you just migrated.

---

## Time estimate

| Phase | First app | Subsequent |
|---|---|---|
| Assess | 10 min | 5 min |
| Adapter | 1–2 h | 10 min (copy) |
| Postgres port | 45 min | 20 min |
| Blob swap | 30 min | 10 min |
| Provision + deploy | 30 min | 15 min |
| Verify | 20 min | 10 min |

Most of the cost is one-time. The adapter and the Blob layer copy across
almost unchanged between apps built from the same template.

**Databases:** apps from this template each define their own `users` table, so
they cannot share one Postgres database without collisions. Give each app its
own, or separate schemas.

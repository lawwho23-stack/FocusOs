# Planning Kanban verification

The shared `.env` database must never be used for these checks. The test suite has an explicit URL guard and verifies the PostgreSQL data directory before resetting its own fixture table. The preview uses a separate disposable database.

## Standard checks

```sh
npm test
npm run lint
npx tsc --noEmit
npx prisma validate
npm run build -- --webpack
```

The production build uses webpack in this environment because Turbopack's build sandbox cannot bind its internal port. It produces the same Next.js application routes.

## Isolated PostgreSQL

Requires local PostgreSQL binaries. Initialize this task-owned cluster once:

```sh
mkdir -p /private/tmp/focusos-kanban-pg
initdb -D /private/tmp/focusos-kanban-pg/data -A trust --no-locale -E UTF8
pg_ctl -D /private/tmp/focusos-kanban-pg/data -l /private/tmp/focusos-kanban-pg/server.log -o '-h 127.0.0.1 -p 55439 -k /private/tmp/focusos-kanban-pg' start
createdb -h 127.0.0.1 -p 55439 focusos_kanban_test
```

Run repeatable migration/backfill, persistence, rollback, archive/restore, and concurrent-write checks. Use your local PostgreSQL user in the URL:

```sh
PLANNING_TEST_DATABASE_URL="postgresql://$(whoami)@127.0.0.1:55439/focusos_kanban_test" node --import tsx --test tests/planning-postgres.test.mts
```

Only this exact host, port, database name, and task-owned data directory are accepted. The suite resets its Planning fixture table and enum before each run. It does not modify the preview database.

For a separate local preview, create `focusos_kanban_preview`, override **both** Prisma URLs, and apply the full migration history to that local database:

```sh
createdb -h 127.0.0.1 -p 55439 focusos_kanban_preview
DATABASE_URL="postgresql://$(whoami)@127.0.0.1:55439/focusos_kanban_preview" DIRECT_URL="postgresql://$(whoami)@127.0.0.1:55439/focusos_kanban_preview" npx prisma migrate deploy
DATABASE_URL="postgresql://$(whoami)@127.0.0.1:55439/focusos_kanban_preview" DIRECT_URL="postgresql://$(whoami)@127.0.0.1:55439/focusos_kanban_preview" npm run start -- --hostname 127.0.0.1
```

In a second terminal, run `node tests/planning-preview.mjs`, then open `http://127.0.0.1:3010/planning`. Planning requests reach the isolated preview database; all other API paths return fixtures. Alternate gateways simulate reduced motion (`3012`) and failed browser draft storage (`3013`). `/__test/fail-move`, `/__test/fail-save`, and `/__test/slow-save` inject one-time failure or delay. These routes exist only in the local test gateway.

## Browser regressions

Use an installed Chrome and temporary Playwright tooling outside the project:

```sh
npm install --prefix /private/tmp/focusos-kanban-browser-tools playwright
PLANNING_PLAYWRIGHT_MODULE=/private/tmp/focusos-kanban-browser-tools/node_modules/playwright/index.mjs node --import tsx tests/planning-browser.mjs
```

The browser suite intercepts all API requests with in-memory fixtures. It exercises keyboard and mouse movement, cancellation, failure rollback/retry, reload ordering, writing and edit draft recovery, save and cleanup failures, archive/restore, keyboard focus, mobile sizing, emulated touch input, native scrolling, automatic board scrolling, and reduced motion. Checklist checks cover add, complete, remove, reload persistence, failure rollback/retry, and safe interactions while dragging from the card background. It also checks for fresh browser errors. `PLANNING_BROWSER_SCENARIO` can select a scenario by name for debugging.

Plan checklists are independent of daily mission tasks. The checklist migration gives existing plans an empty list. `POST /api/planning-ideas/[id]/checklist` accepts one add, toggle, or remove operation; serializable transactions apply it to the latest saved list, preserving concurrent additions. The PostgreSQL suite verifies this alongside move, edit, archive, and restore. Apply the migration only to the isolated preview database during local verification.

Touch verification uses Chromium device emulation. Physical iOS and Android device testing remains a separate acceptance step.

Stop only the owned temporary cluster when the preview is no longer needed:

```sh
pg_ctl -D /private/tmp/focusos-kanban-pg/data stop
```

No deployment or shared-database migration is included in this change.

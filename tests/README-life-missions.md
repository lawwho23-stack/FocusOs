# Life Missions verification

Life missions are separate from `DailyMission`, Goal, PlanningIdea, and AI Coach data. Saved missions use PostgreSQL; unsaved editors use per-tab session storage. Drafts survive refresh and navigation in the same tab. Save before closing the tab. A pending New step is included when saving.

Run the regular checks from `control_dopamin`:

```sh
npm test
npm run lint
npx tsc --noEmit
npx prisma validate
npm run build -- --webpack
```

The shared database migration is deliberately pending. Do not run write tests against the project `.env` database.

For integration checks, create a task-owned PostgreSQL cluster under `/private/tmp/focusos-life-pg.XXXXXX`, listening only on `127.0.0.1:55447`, with database `focusos_life_test`. Override both `DATABASE_URL` and `DIRECT_URL` with that local URL before running `npx prisma migrate deploy`. Set `LIFE_MISSIONS_TEST_DATABASE_URL` to the same URL and run:

```sh
node --import tsx --test tests/life-missions-postgres.test.mts
```

The test guards host, port, database name, and PostgreSQL data directory before writing. It creates and cleans up only its own records. It verifies CRUD, checklist persistence, independence from daily missions, database defaults, and simultaneous stale writes.

For browser checks, start the isolated FocusOS server on `127.0.0.1:3047`, using both local database URL overrides. Follow any workspace preview hook requirements; do not silently bypass a blocked preview. Then use temporary Playwright tooling outside the repo:

```sh
LIFE_MISSIONS_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/life-missions-browser.mjs
```

The browser suite intercepts every `/api/` request with fixtures, including coach requests. It cannot write to a database or call an AI provider. Scenarios cover create/edit/delete, icons, checklist changes, draft recovery, blank step editing, stale-save review, failed saves, storage failures, separate tabs, pending steps, mobile sizing, navigation order, load retries, and the removed dashboard timer. Screenshots go to `/private/tmp/focusos-life-mobile.png` and `/private/tmp/focusos-no-timer.png`.

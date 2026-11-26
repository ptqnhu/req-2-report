# LoanMart Insights

Turns a plain-English business request into a SQL query for LoanMart's databases (APM, NLS, LoanMart), then into a formatted report exported as an `.rdl` file for SQL Server Reporting Services (SSRS).

The app never connects to a database. Queries are written from saved schema files (names and types, no data), and SSRS runs them through a data source configured on the report server.

Steps: **Query → Columns → Template → Title & filters → Report & export**.

- **Query.** Pick a database and describe the report ("loans funded last month with customer name and amount"). Follow-up messages refine the query, or you can edit it by hand.
- **Columns.** The AI lists the columns the query returns and their SQL Server types, which decide how each is displayed. For a hand-written query, choose **Read columns**.
- **Preview.** Shows made-up sample rows: the report's look, not its data.
- **Export.** The `.rdl` points at a shared data source on the report server (or an embedded connection string), so the app never handles database credentials.

## Getting started

Requires Node.js 18.18+ and, for the AI, Claude Code signed in on the server's computer (run `claude` once, then `/login`).

```bash
npm install        # installs all three workspaces
npm run dev        # API on :4000, UI on http://localhost:5173 (proxies /api)
npm test           # no database or Claude calls needed
```

For production, `npm run build` then `npm start` serves the API and built client on one port.

## Configuration

All optional; set them in the environment or in a git-ignored `.env` at the project root.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Server port |
| `CLIENT_ORIGIN` | same origin only | Allowed CORS origin if the UI is hosted elsewhere |
| `TEMPLATES_FILE` | `server/data/templates.json` | Saved templates |
| `BODY_LIMIT` | `2mb` | Largest request body |
| `AI_BACKEND` | `cli` | `cli` runs Claude Code headless (`claude -p`) on the signed-in account; `api` uses the Claude API, which also caches the schema between follow-ups |
| `ANTHROPIC_API_KEY` | none | Required for `AI_BACKEND=api` ([console.anthropic.com](https://console.anthropic.com)) |
| `CLAUDE_CLI_PATH` | auto | Path to `claude.exe`; defaults to the newest VS Code extension's bundled copy, then `claude` on the PATH |
| `AI_MODEL` | `claude-opus-5-5` | Model |
| `AI_EFFORT` | `high` | `low`, `medium`, `high`, `xhigh` or `max` |
| `AI_TIMEOUT_SECONDS` | `180` | Longest the AI may take |
| `AI_SCHEMA_MAX_CHARS` | `1500000` | Largest schema the AI may be sent |

## What the AI is sent

**Schema files.** `server/schemas/<database>.txt` (name matched ignoring case); only databases with a filled-in file appear in the picker. One line per table or view, then foreign keys. `#` lines are ignored.

```
dbo.loan (table): loan_no int, contract_dtm datetime, ...
Foreign keys:
dbo.loan_person.loan_no -> dbo.loan.loan_no
```

Export one with `sqlcmd -S <server> -d NLS -E -C -i server/scripts/schema.sql -y 0 -f 65001 -o server/schemas/NLS.txt`, or write it by hand (as `APM.txt` is, from the APM data dictionary).

**Knowledge base.** `knowledge/glossary/*.yaml`, `joins.yaml`, `gotchas.md` and `tables/<database>/*.yaml` for the chosen database, minus whole-line `#` comments. `golden/` is never sent; those queries test the assistant.

Changes to either apply on the next AI request.

## Where to change things

| To change… | Edit |
|---|---|
| What the AI is told | `server/src/services/ai/prompt.js` |
| A database's tables and columns | `server/schemas/<database>.txt` |
| What business terms and columns mean | `knowledge/` (see `knowledge/README.md`) |
| The loan lifecycle stages (the Loan lifecycle page, also sent to the AI) | `knowledge/lifecycle.yaml` |
| SQL Server type → display type | `server/src/services/typeInference.js` |
| Which queries are allowed | `server/src/services/queryGuard.js` |
| The .rdl contents | `server/src/rdl/` |
| Number or date formatting | `shared/values.js` (preview), `server/src/rdl/styles.js` (SSRS) |
| Filter behaviour | `shared/filters.js` (preview), `server/src/rdl/filters.js` (SSRS) |
| Preview sample rows | `client/src/utils/sampleRows.js` |
| Screens and wording | `client/src/steps/`, `client/src/components/` |
| Look and feel | `client/src/styles.css` |

## Project layout

```
req-2-report/
├── shared/            Dependency-free logic used by client and server
│   ├── constants.js       Types, filter operators, default template and export settings
│   ├── text.js            Name helpers: tokens, prettify, idLike, fileSlug
│   ├── dates.js           Date parsing and formatting
│   ├── values.js          coerce (raw → typed) and formatValue (typed → text)
│   ├── filters.js         filterActive, testFilter, applyFilters, describeFilter
│   └── columns.js         effectiveColumns, alignOf, keyBy
├── server/            Node + Express API
│   ├── src/
│   │   ├── index.js / app.js  Startup, routes, serves client/dist in production
│   │   ├── routes/        HTTP only: ai.js, templates.js, rdl.js
│   │   ├── services/      Business logic
│   │   │   ├── ai/            Prompt, schema loading, CLI and API backends
│   │   │   ├── columns.js     AI column list → report columns
│   │   │   ├── queryGuard.js  Allows only a single SELECT / WITH
│   │   │   ├── sqlMask.js     Blanks comments and strings for keyword scanning
│   │   │   ├── typeInference.js
│   │   │   ├── sqlParser.js   Main table for the default title
│   │   │   └── templateStore.js
│   │   ├── rdl/           buildRdl, filters, textbox, styles, xml
│   │   └── lib/           Config, errors, input validation
│   ├── test/          node:test unit tests
│   ├── schemas/       <database>.txt schema files
│   ├── scripts/       schema.sql (run with sqlcmd)
│   └── data/          templates.json
├── knowledge/         Glossary, joins, tables, gotchas, golden queries
└── client/src/        React + Vite UI
    ├── App.jsx            Step navigation and report state
    ├── api.js             All server calls
    ├── steps/             One component per step
    ├── components/        Reusable UI
    ├── hooks/             useTemplates, useRdlExport
    └── utils/             Sorting, totals, sample rows, downloads
```

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/databases` | | `{ databases: [{ name, tables }] }` |
| POST | `/api/ai/query` | `{ database, messages: [{ role: "user", content } \| { role: "assistant", sql, explanation }], sql? }` | `{ sql, explanation, columns, table }` |
| POST | `/api/ai/columns` | `{ database, sql }` | `{ columns, table, note }` |
| GET | `/api/templates` | | `{ templates }` |
| PUT | `/api/templates/:name` | template | `{ templates }` |
| DELETE | `/api/templates/:name` | | `{ templates }` |
| POST | `/api/rdl` | `{ sql, columns, tpl, title, desc, filters, sort, exp }` | `{ rdl, fileName, warnings, problem }` |
| POST | `/api/rdl?download=1` | same | the `.rdl` file |

## Security

- **No database access.** No credentials, no queries run. Data access is controlled by the SSRS data source.
- **Read-only queries.** Only a single `SELECT`/`WITH` is accepted, when reading columns and when building the `.rdl`. Still give the SSRS data source a read-only login: that's the real protection.
- **AI data.** Anthropic receives the schema file, the knowledge base (keep row data and secrets out of `knowledge/`) and what the user types. The CLI runs with all tools disabled, so it can't read files or run commands.
- **No user accounts.** Run on the internal network or behind existing single sign-on.

## Uploading to SSRS

In the SSRS web portal, open a folder, choose **Upload** and pick the `.rdl`. Then, depending on the data source:

- **Readers' Windows login:** nothing more, if readers can read the database.
- **Stored SQL login:** report's **Manage** page → **Data sources** → "Using the following credentials". The `.rdl` never contains a password.
- **Shared data source:** if it doesn't link automatically, pick it on the same **Data sources** page.

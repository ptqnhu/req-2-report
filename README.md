# LoanMart Insights

Turns a business request into a SQL query for LoanMart's databases (APM, NLS, LoanMart), then into a formatted report exported as an `.rdl` file for SQL Server Reporting Services (SSRS).

The app never connects to a database. Queries are written from saved schema files (table and column names and types, no data), and the report runs the query on the SSRS server, through a data source set up there.

The steps are: **Query → Columns → Template → Title & filters → Report & export**.

- **Query.** Pick the database, then describe the report in plain English ("loans funded last month with customer name and amount") and Claude writes the query from that database's schema file. Follow-up messages refine it. You can also write or edit the query yourself. By default the server runs the Claude Code CLI headless (`claude -p`) with the Claude account signed in on that computer, so no API key is needed; set `AI_BACKEND=api` to use the Claude API instead.
- **Columns.** The AI lists the columns the query returns, with their SQL Server types worked out from the schema; each type picks how the column is shown. For a query you wrote yourself, choosing **Read columns** asks the AI for them.
- **Preview.** Every preview shows made-up sample rows that fit the columns' types. They show the report's look, not its data.
- **Export.** The `.rdl` file points at a shared data source on the report server (or an embedded connection string), so the app never handles database credentials.

## Project layout

```
req-2-report/
├── shared/                 Logic used by both sides (no dependencies)
│   ├── constants.js        Types, filter operators, default template and export settings
│   ├── text.js             Name helpers: tokens, prettify, idLike, fileSlug
│   ├── dates.js            Date parsing and formatting
│   ├── values.js           coerce (raw → typed value) and formatValue (typed value → display text)
│   ├── filters.js          filterActive, testFilter, applyFilters, describeFilter
│   └── columns.js          effectiveColumns (columns + template settings), alignOf, keyBy
│
├── server/                 Node + Express API
│   ├── src/
│   │   ├── index.js        Starts the server (PORT, default 4000)
│   │   ├── app.js          Express setup, routes, serves client/dist in production
│   │   ├── routes/         HTTP layer only: validate input, call a service, send JSON
│   │   │   ├── ai.js           GET /api/databases, POST /api/ai/query, POST /api/ai/columns
│   │   │   ├── templates.js    GET / PUT / DELETE /api/templates
│   │   │   └── rdl.js          POST /api/rdl  (?download=1 returns the file)
│   │   ├── services/       Business logic, no Express code
│   │   │   ├── ai/             Prompt, schema files, Claude CLI and API backends
│   │   │   ├── columns.js      The AI's column list → report columns
│   │   │   ├── queryGuard.js   Allows only single SELECT / WITH statements
│   │   │   ├── sqlMask.js      Blanks comments and strings so SQL keywords can be found safely
│   │   │   ├── typeInference.js SQL Server type (+ column name) → display type
│   │   │   ├── sqlParser.js    Finds the main table for the default title
│   │   │   └── templateStore.js Saved templates (JSON file)
│   │   ├── rdl/            SSRS export
│   │   │   ├── buildRdl.js     Assembles the report definition
│   │   │   ├── filters.js      App filters → RDL filters / report parameters
│   │   │   ├── textbox.js      RDL <Textbox> builder
│   │   │   ├── styles.js       Themes, .NET formats, column widths
│   │   │   └── xml.js          Escaping, names, units
│   │   └── lib/            Settings (config.js), errors and input validation
│   ├── test/               node:test unit tests
│   ├── schemas/            One <database>.txt per database: what the AI writes queries from
│   ├── scripts/            schema.sql exports a schema file from a database (run with sqlcmd)
│   └── data/               templates.json is written here
│
├── knowledge/              Business meaning the schema doesn't show: glossary, joins, tables, gotchas, golden queries
│
└── client/                 React + Vite UI
    └── src/
        ├── App.jsx         Step navigation and report state
        ├── api.js          All calls to the server
        ├── steps/          One component per step
        ├── components/     Reusable UI (report table, export panel, …)
        ├── hooks/          useTemplates, useRdlExport
        └── utils/          Sorting, totals, sample rows, downloads
```

**Where to change things**

| To change… | Edit |
|---|---|
| What the AI is told | `server/src/services/ai/prompt.js` |
| A database's tables and columns | `server/schemas/<database>.txt` |
| What business terms and columns mean | `knowledge/` (sent to the AI with the schema; see `knowledge/README.md`) |
| How SQL Server types map to display types | `server/src/services/typeInference.js` |
| Which queries are allowed | `server/src/services/queryGuard.js` |
| What the .rdl file contains | `server/src/rdl/` |
| Number or date formatting (preview) | `shared/values.js` (and `server/src/rdl/styles.js` for SSRS) |
| Filter behaviour | `shared/filters.js` (preview) and `server/src/rdl/filters.js` (SSRS) |
| The preview's sample rows | `client/src/utils/sampleRows.js` |
| Screens and wording | `client/src/steps/`, `client/src/components/` |
| Look and feel | `client/src/styles.css` |

## Getting started

Requires Node.js 18.18 or later.

```bash
npm install        # installs all three packages (npm workspaces)
npm run dev        # API on http://localhost:4000, UI on http://localhost:5173
```

Open http://localhost:5173. Vite forwards `/api` requests to the server.

## Production

```bash
npm run build      # builds the client into client/dist
npm start          # serves the API and the built client on one port
```

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Server port |
| `CLIENT_ORIGIN` | none (same origin only) | Allowed CORS origin if the UI is hosted elsewhere |
| `TEMPLATES_FILE` | `server/data/templates.json` | Where saved templates are stored |
| `BODY_LIMIT` | `2mb` | Largest request body |
| `AI_BACKEND` | `cli` | How the AI assistant reaches Claude: `cli` (Claude Code, headless) or `api` (the Claude API with `ANTHROPIC_API_KEY`) |
| `ANTHROPIC_API_KEY` | none | API key for `AI_BACKEND=api`. Get one at https://console.anthropic.com |
| `CLAUDE_CLI_PATH` | found automatically | Path to `claude.exe` for the AI assistant. By default the copy bundled with the newest Claude Code extension for VS Code, then `claude` on the PATH |
| `AI_MODEL` | `claude-opus-5-5` | Claude model the assistant uses |
| `AI_EFFORT` | `high` | How hard it thinks: `low`, `medium`, `high`, `xhigh` or `max` |
| `AI_TIMEOUT_SECONDS` | `180` | Longest the assistant may take to answer |
| `AI_SCHEMA_MAX_CHARS` | `1500000` | Largest schema description the assistant may send |

These can also go in a `.env` file at the project root (for example `AI_EFFORT=medium`); it's ignored by git.

With `AI_BACKEND=cli` (the default), the AI assistant needs Claude Code signed in on the computer running the app's server: run `claude` once and use `/login`. Its usage counts against that account. To switch to the Claude API, put `AI_BACKEND=api` and `ANTHROPIC_API_KEY=sk-ant-...` in `.env` and restart the server. The API backend also caches the schema between questions, which makes follow-ups cheaper.

### Schema files

Each database the app writes queries for has a file in `server/schemas/` named after it (`APM.txt`, matched ignoring case); only databases with a filled-in file appear in the picker. The format is one line per table or view, then the foreign keys:

```
dbo.loan (table): loan_no int, contract_dtm datetime, ...
Foreign keys:
dbo.loan_person.loan_no -> dbo.loan.loan_no
```

Lines starting with `#` are ignored, so a file with nothing else (a template) counts as no file. To export a file from a database, run `server/scripts/schema.sql` against it from a computer that can reach it, for example `sqlcmd -S <server> -d NLS -E -C -i server/scripts/schema.sql -y 0 -f 65001 -o server/schemas/NLS.txt`. A file can also be written by hand, as `APM.txt` is from the APM data dictionary. Changes apply to the next AI request.

With the schema, the AI is sent the knowledge base: `knowledge/glossary.yaml`, `joins.yaml` and `gotchas.md`, plus `knowledge/tables/<database>/*.yaml` for the chosen database. Whole-line `#` comments in the YAML files are left out. `golden/` is never sent, since those queries test the assistant. Changes apply to the next AI request too.

## Tests

```bash
npm test
```

Covers the read-only query guard, schema files, the AI backends and column list, SQL Server type mapping, display formats, slicers and RDL generation. Nothing needs a database or calls Claude.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/databases` | | `{ databases: [{ name, tables }] }` (those with a schema file) |
| POST | `/api/ai/query` | `{ database, messages: [{ role: "user", content } \| { role: "assistant", sql, explanation }], sql? }` | `{ sql, explanation, columns, table }` |
| POST | `/api/ai/columns` | `{ database, sql }` | `{ columns, table, note }` (the columns of a hand-written query) |
| GET | `/api/templates` | | `{ templates }` |
| PUT | `/api/templates/:name` | template | `{ templates }` |
| DELETE | `/api/templates/:name` | | `{ templates }` |
| POST | `/api/rdl` | `{ sql, columns, tpl, title, desc, filters, sort, exp }` | `{ rdl, fileName, warnings, problem }` |
| POST | `/api/rdl?download=1` | same | the `.rdl` file |

## Security

- **No database access.** The app holds no database credentials and never runs a query. The report's data source, and who can read it, is set up on the SSRS server.
- **Read-only queries.** The app refuses anything other than a single `SELECT`/`WITH` statement, both when reading columns and when building the `.rdl`. The SSRS data source should still use a read-only login: that's the real protection, since the report runs the query.
- **The AI assistant** sends the chosen database's schema file (table, view and column names and types), the knowledge base in `knowledge/` (so keep row data and secrets out of it) plus what the user types to Anthropic, through the Claude Code CLI or the Claude API depending on `AI_BACKEND`. There is no row data to send, and the CLI runs with every tool turned off, so it can't read files or run commands.
- The app has no user accounts of its own. Run it on your internal network, or put it behind your existing single sign-on.

## Uploading to SSRS

In the SSRS web portal, open a folder and choose **Upload**, then pick the `.rdl` file.

- **Readers use their Windows login:** nothing else to do, as long as readers can read the database.
- **Stored SQL login:** open the report's **Manage** page, choose **Data sources**, select "Using the following credentials", and enter the login. The `.rdl` never contains a password.
- **Shared data source:** if it doesn't link automatically, choose it on the same **Data sources** page.

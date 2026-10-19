# LoanMart Insights

Connects to a SQL Server database, turns a query into a formatted report, and exports it as an `.rdl` file for SQL Server Reporting Services (SSRS).

The steps are: **Connect → Query → Columns → Data types → Template → Title & filters → Report & export**.

- **Connect.** Sign in with a SQL Server login or a Windows account (NTLM). The password is used once to open a connection pool on the app's server; the browser only keeps a random connection id, and the password is never stored or written into the report.
- **Query.** SQL Server describes the query with `sys.sp_describe_first_result_set`, which gives the exact column names and SQL types without running it. `SELECT *` works.
- **Ask AI.** On the Query step, describe the report in plain English ("loans funded last month with customer name and amount") and Claude writes the query into the editor. Follow-up messages refine it. By default the server runs the Claude Code CLI headless (`claude -p`) with the Claude account signed in on that computer, so no API key is needed; set `AI_BACKEND=api` to use the Claude API instead.
- **Preview.** The query runs for real, but streams only the first rows (200 by default) and is cancelled after that. It runs inside a transaction that is always rolled back.
- **Export.** The `.rdl` file's data source is filled in from the connection.

## Project layout

```
report-builder/
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
│   │   │   ├── connections.js  POST / GET / DELETE /api/connections
│   │   │   ├── query.js        POST /api/analyze, POST /api/preview
│   │   │   ├── templates.js    GET / PUT / DELETE /api/templates
│   │   │   └── rdl.js          POST /api/rdl  (?download=1 returns the file)
│   │   ├── services/       Business logic, no Express code
│   │   │   ├── db/
│   │   │   │   ├── mssqlDriver.js       The only file that uses the mssql package
│   │   │   │   ├── connectionConfig.js  Validates the connect form → mssql config
│   │   │   │   ├── connectionManager.js One pool per session, idle timeout, cleanup
│   │   │   │   ├── describe.js          Columns and SQL types via sp_describe_first_result_set
│   │   │   │   ├── preview.js           First N rows, streamed, cancelled, rolled back
│   │   │   │   ├── serialize.js         Driver values → JSON
│   │   │   │   └── errors.js            Readable SQL Server error messages
│   │   │   ├── queryGuard.js   Allows only single SELECT / WITH statements
│   │   │   ├── analyze.js      Guard + describe → columns
│   │   │   ├── typeInference.js SQL Server type (+ column name) → display type
│   │   │   ├── sqlParser.js    Finds the main table for the default title
│   │   │   ├── templateStore.js Saved templates (JSON file)
│   │   │   └── activityLog.js  Sign-in and AI request log (LOG_DATABASE)
│   │   ├── rdl/            SSRS export
│   │   │   ├── buildRdl.js     Assembles the report definition
│   │   │   ├── filters.js      App filters → RDL filters / report parameters
│   │   │   ├── textbox.js      RDL <Textbox> builder
│   │   │   ├── styles.js       Themes, .NET formats, column widths
│   │   │   └── xml.js          Escaping, names, units
│   │   └── lib/            Settings (config.js), errors and input validation
│   ├── test/               node:test unit tests (a fake SQL Server is in test/helpers)
│   ├── schemas/            Saved schemas for the AI assistant, one <database>.txt each
│   ├── scripts/            saveSchema.js writes a file in schemas/ from a live database
│   └── data/               templates.json is written here
│
└── client/                 React + Vite UI
    └── src/
        ├── App.jsx         Step navigation and report state
        ├── api.js          All calls to the server
        ├── steps/          One component per step
        ├── components/     Reusable UI (report table, export panel, …)
        ├── hooks/          usePreviewRows, useTemplates, useRdlExport
        └── utils/          Sorting, totals, downloads
```

**Where to change things**

| To change… | Edit |
|---|---|
| How SQL Server types map to display types | `server/src/services/typeInference.js` |
| Which queries are allowed | `server/src/services/queryGuard.js` |
| Connection options (timeouts, pool size, encryption) | `server/src/services/db/connectionConfig.js` |
| What the .rdl file contains | `server/src/rdl/` |
| Number or date formatting (preview) | `shared/values.js` (and `server/src/rdl/styles.js` for SSRS) |
| Filter behaviour | `shared/filters.js` (preview) and `server/src/rdl/filters.js` (SSRS) |
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
| `DB_SERVER`, `DB_DATABASE` | off | A database every page opens by itself, so nobody has to fill in the connect form. Anyone who can reach the app gets it, signed in with the login below |
| `DB_AUTH` | `sql` | How the default database signs in: `sql`, `windows` (`DB_USER` as `DOMAIN
ame`) or `local` (the Windows account running the app; SQL Server on this computer only) |
| `DB_USER`, `DB_PASSWORD` | none | Login for the default database. Give it read-only access |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | `true`; `true` for localhost | Encryption options for the default database |
| `ALLOWED_SERVERS` | any | Comma-separated SQL Server host names users may connect to. **Set this in production.** |
| `CONNECTION_IDLE_MINUTES` | `30` | Close database connections unused for this long |
| `MAX_CONNECTIONS` | `50` | Most open connections at once |
| `PREVIEW_ROW_LIMIT` | `200` | Rows shown in the preview (the SSRS report returns every row) |
| `CHART_ROW_LIMIT` | `100000` | Charts use every row the query returns; this is only a safety ceiling |
| `QUERY_TIMEOUT_SECONDS` | `60` | Longest a preview query may run |
| `CLIENT_ORIGIN` | any | Allowed CORS origin if the UI is hosted elsewhere |
| `TEMPLATES_FILE` | `server/data/templates.json` | Where saved templates are stored |
| `BODY_LIMIT` | `2mb` | Largest request body |
| `AI_BACKEND` | `cli` | How the AI assistant reaches Claude: `cli` (Claude Code, headless) or `api` (the Claude API with `ANTHROPIC_API_KEY`) |
| `ANTHROPIC_API_KEY` | none | API key for `AI_BACKEND=api`. Get one at https://console.anthropic.com |
| `CLAUDE_CLI_PATH` | found automatically | Path to `claude.exe` for the AI assistant. By default the copy bundled with the newest Claude Code extension for VS Code, then `claude` on the PATH |
| `AI_MODEL` | `claude-opus-5-5` | Claude model the assistant uses |
| `AI_EFFORT` | `high` | How hard it thinks: `low`, `medium`, `high`, `xhigh` or `max` |
| `AI_TIMEOUT_SECONDS` | `180` | Longest the assistant may take to answer |
| `AI_SCHEMA_MAX_CHARS` | `1500000` | Largest schema description the assistant may send |
| `LOG_DATABASE` | off | SQL Server database for the activity log (sign-ins and AI requests), e.g. `ReportBuilderLog` |
| `LOG_SERVER` | `localhost` | SQL Server that holds `LOG_DATABASE` |
| `LOG_USER`, `LOG_PASSWORD` | none | SQL login for the log database. Without them the app signs in as the Windows account running it (local SQL Server only) |
| `LOG_TRUST_SERVER_CERTIFICATE` | `true` for localhost | Accept the log server's certificate without checking it |

These can also go in a `.env` file at the project root (for example `AI_EFFORT=medium`); it's ignored by git.

With `AI_BACKEND=cli` (the default), the AI assistant needs Claude Code signed in on the computer running the app's server: run `claude` once and use `/login`. Its usage counts against that account. To switch to the Claude API, put `AI_BACKEND=api` and `ANTHROPIC_API_KEY=sk-ant-...` in `.env` and restart the server. The API backend also caches the schema between questions, which makes follow-ups cheaper.

The assistant describes the database to Claude from a saved file in `server/schemas/` when there is one named after the database (`AdventureWorks2022.txt`, matched ignoring case); otherwise it reads the tables, columns and foreign keys from SQL Server. To save or refresh a file from a SQL Server on this computer (signs in as your Windows account), run `npm run schema:save -w server -- <database> [server]`, for example `npm run schema:save -w server -- AdventureWorks2022`. The file is plain text and can be edited by hand, for instance to add notes about what columns mean; lines starting with `#` are ignored, and a file with nothing else (like the APN, NLS, LoanMart and GenesysCloud templates) counts as no file. For a database this computer can't reach, run `server/scripts/schema.sql` against it from one that can, for example `sqlcmd -S <server> -d APN -E -C -i server/scripts/schema.sql -y 0 -f 65001 -o server/schemas/APN.txt`. Changes apply from the next connection to that database.

### Activity log

Set `LOG_DATABASE` and the server records, in that database:

- `dbo.SignInLog`: every connect attempt, with the server, database, login, browser IP, SQL Server version, and whether it worked (with the error if not).
- `dbo.AiRequestLog`: every Ask AI request, with who asked, what they typed, the query in the editor, where the schema came from (`file` or `database`), the backend and model, the SQL and explanation returned, how long it took, and the error if it failed.

Create the database once (`CREATE DATABASE ReportBuilderLog`); the app creates the tables on first use, so its login needs `db_owner` there, or create the tables yourself and grant `INSERT` only. Times are UTC. Writing the log never slows down or fails a request: if the log database is unreachable, the server prints the error and carries on. For example:

```sql
SELECT CAST(LoggedAt AS date) AS Day, LoginName, COUNT(*) AS Requests,
       SUM(CASE WHEN Succeeded = 0 THEN 1 ELSE 0 END) AS Failed, AVG(DurationMs) AS AvgMs
FROM ReportBuilderLog.dbo.AiRequestLog
GROUP BY CAST(LoggedAt AS date), LoginName
ORDER BY Day DESC;
```

## Tests

```bash
npm test
```

Covers connection settings and lifetime, the read-only query guard, SQL Server type mapping, describing queries, the streamed preview (row limit, cancel, timeout, rollback) and RDL generation. Database tests use a fake SQL Server, so no database is needed to run them.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/connections` | `{ server, database, authType: "sql"\|"windows", user, password, encrypt?, trustServerCertificate? }` | `{ connectionId, server, database, user, version }` |
| GET | `/api/connections/:id` | | connection details |
| DELETE | `/api/connections/:id` | | `204` |
| POST | `/api/analyze` | `{ connectionId, sql }` | `{ columns, table }` |
| POST | `/api/preview` | `{ connectionId, sql }` | `{ rows, truncated, limit }` |
| POST | `/api/count` | `{ connectionId, sql }` | `{ count }` (every row the query returns) |
| POST | `/api/ai/query` | `{ connectionId, messages: [{ role: "user", content } \| { role: "assistant", sql, explanation }], sql? }` | `{ sql, explanation }` |
| GET | `/api/templates` | | `{ templates }` |
| PUT | `/api/templates/:name` | template | `{ templates }` |
| DELETE | `/api/templates/:name` | | `{ templates }` |
| POST | `/api/rdl` | `{ sql, columns, tpl, title, desc, filters, sort, exp }` | `{ rdl, fileName, warnings, problem }` |
| POST | `/api/rdl?download=1` | same | the `.rdl` file |

An expired or unknown `connectionId` returns **410**; the UI then asks the user to connect again.

## Security

- **Use a read-only login.** Give report authors a SQL login or Windows group with only `db_datareader` (or `SELECT` on specific views). This is the real protection.
- The app adds two more guards: it refuses anything other than a single `SELECT`/`WITH` statement, and every preview runs in a transaction that is rolled back.
- **Set `ALLOWED_SERVERS`** so the app can only connect to your SQL Servers.
- **Serve the app over HTTPS**, since passwords are sent from the browser to the app's server when connecting.
- Passwords live only in the server's memory, inside the connection pool, and are dropped when the connection closes or goes idle. They're never logged, returned to the browser, or written into `.rdl` files.
- **The AI assistant** sends the database's table, view and column names and types, plus what the user types, to Anthropic, through the Claude Code CLI or the Claude API depending on `AI_BACKEND`. It never sends row data, and the CLI runs with every tool turned off, so it can't read files or run commands. If schema names mustn't leave your network, don't sign Claude Code in on the server and don't set an API key.
- **The activity log** stores what users type into Ask AI and the queries they get back, but never passwords or row data. Limit who can read `LOG_DATABASE`.
- The app has no user accounts of its own. Run it on your internal network, or put it behind your existing single sign-on.

## Uploading to SSRS

In the SSRS web portal, open a folder and choose **Upload**, then pick the `.rdl` file.

- **Readers use their Windows login:** nothing else to do, as long as readers can read the database.
- **Stored SQL login:** open the report's **Manage** page, choose **Data sources**, select "Using the following credentials", and enter the login. The `.rdl` never contains a password.
- **Shared data source:** if it doesn't link automatically, choose it on the same **Data sources** page.

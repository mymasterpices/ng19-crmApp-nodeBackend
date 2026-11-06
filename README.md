# RKJ CRM API

The `backend/` directory contains the Express API, MongoDB models, authentication middleware, CRM integrations, and the production static-file host for the Angular application. The API is written in CommonJS JavaScript and uses Express 5 and Mongoose.

This document covers the backend directory only. The Angular frontend is maintained in the sibling `app/` directory.

## Contents

- [Requirements](#requirements)
- [Setup and run](#setup-and-run)
- [Environment configuration](#environment-configuration)
- [Architecture and request lifecycle](#architecture-and-request-lifecycle)
- [API route map](#api-route-map)
- [Data models](#data-models)
- [Integrations and file storage](#integrations-and-file-storage)
- [Project structure](#project-structure)
- [Testing and operational notes](#testing-and-operational-notes)

## Requirements

- Node.js and npm compatible with the dependencies in `package-lock.json`
- MongoDB reachable by the backend process
- Optional services/credentials for Google Sheets, Anthropic AI, and image search

## Setup and run

Run commands from this `backend/` directory:

```bash
npm ci
```

Configure local environment variables as described below, then start the API with automatic restart on changes:

```bash
npm run dev
```

The default listen port is `3000`. To use the frontend's default development API port, configure `PORT=5200` (the Angular development environment points to `http://localhost:5200`). The Angular development server separately proxies `/api` requests to port 5200 using `app/proxy.conf.json`.

The server connects to MongoDB during startup. If MongoDB connection fails, the connection module logs the error and exits the process.

## Environment configuration

`app.js` loads `.env` when `NODE_ENV=production`; otherwise it loads `.env.local`. These files are intentionally ignored by Git. Add local values to the appropriate file, and never commit real secrets or service-account credentials. Do not copy production credentials into development files.

Variables referenced by backend code:

| Variable                       | Purpose                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | Selects `.env` in production; other values use `.env.local`                                    |
| `PORT`                         | Express listen port; defaults to `3000`                                                        |
| `MONGO_URI`                    | MongoDB connection string; required for database-backed routes                                 |
| `JWT_SECRET`                   | Signs and verifies one-day authentication tokens                                               |
| `UPLOADS_DIR`                  | Optional override for the directory served at `/uploads`; defaults to `backend/uploads`        |
| `ANTHROPIC_API_KEY`            | Enables the AI chat integration                                                                |
| `PYTHON_SERVICE_URL`           | Optional image-search service URL; defaults to `http://127.0.0.1:8002`                         |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Sheets service-account email                                                            |
| `GOOGLE_PRIVATE_KEY`           | Google Sheets service-account private key; escaped newlines are normalized by the integration  |
| `GOOGLE_SHEET_ID`              | Spreadsheet used for order synchronization                                                     |
| `FEEDBBACK_GOOGLE_SHEET_ID`    | Spreadsheet used by the feedback Sheets integration (spelling as currently referenced in code) |

Google Sheets integrations require the service account to have access to the relevant spreadsheet. Keep credential files and values outside documentation and source control. The Git ignore rules exclude local environment and credential files; verify that ignore rules remain in place before adding or changing secret files.

## Architecture and request lifecycle

### Startup

`app.js` is the process entry point. It:

1. Loads the environment file.
2. Creates the configured uploads directory.
3. Configures CORS and a 1 MB JSON body limit.
4. Serves Angular production output from `public/dist/browser` and uploaded files under `/uploads`.
5. Starts the MongoDB connection through `config/connection.js`.
6. Mounts API routers and JSON 404 handling.
7. Serves the Angular `index.html` for non-API deep links.
8. Registers a JSON error handler and starts the Express listener.

### Authentication and roles

- `middleware/jwt.js` reads a bearer token from the `Authorization` header and verifies it with `JWT_SECRET`. Login tokens are configured to expire after one day.
- Most application API routers are mounted behind `verifyToken`.
- `middleware/viewerReadOnly.js` blocks non-GET requests for users whose role is `viewer` on routes where it is mounted.
- `middleware/checkRoles.js` provides role and active-account checks for routes that call it.
- The authentication router includes endpoints with their own route-level authorization. Check the specific handler before assuming an endpoint is public or admin-only.
- Feedback routes are mounted without the global token middleware.

### Error responses

Unknown `/api` paths return JSON 404 responses. The final Express error handler logs the request and error, returns JSON, and hides internal details for 5xx errors in production. Validation errors are generally mapped to HTTP 400.

## API route map

All paths below are relative to the backend host. Except where noted, mounted routers are prefixed with `/api`.

| Prefix                 | Router / responsibility                                          | Access at mount                                                |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `/api/auth`            | Login, registration, profile, password, staff administration     | Mixed; handlers apply their own checks                         |
| `/api/customers`       | Customer records, search, and follow-up lists                    | JWT + viewer read-only                                         |
| `/api/chat`            | Customer chat history and message changes                        | JWT + viewer read-only                                         |
| `/api/sold`            | Sold-item entry, list, details, updates, and deletion            | JWT + viewer read-only                                         |
| `/api/products`        | Product import, tag search, catalogue listing, and filter facets | JWT                                                            |
| `/api/videos`          | Video catalogue, uploads, and share-link operations              | JWT + viewer read-only                                         |
| `/api/videos/shared`   | Shared video link records                                        | JWT + viewer read-only                                         |
| `/api/videos/favorite` | Favorite video lists                                             | JWT + viewer read-only at mount; route handlers may add checks |
| `/api/orders/category` | Order categories                                                 | JWT + viewer read-only                                         |
| `/api/orders/status`   | Order statuses                                                   | JWT + viewer read-only                                         |
| `/api/orders/karigar`  | Karigar records used by order workflows                          | JWT + viewer read-only                                         |
| `/api/orders`          | Orders and order updates                                         | JWT + viewer read-only                                         |
| `/api/targets`         | Sales targets                                                    | JWT + viewer read-only                                         |
| `/api/image-search`    | Similar-image query and indexing operations                      | JWT + viewer read-only                                         |
| `/api/ai-chat`         | AI chat and health endpoint                                      | JWT + viewer read-only                                         |
| `/api/desk`            | CRM Desk enquiries, send logs, and market rules                  | JWT + viewer read-only                                         |
| `/api/feedback`        | Feedback submission and management                               | No global JWT middleware                                       |

### CRM Desk endpoints

The router in `routes/desk.routes.js` is mounted at `/api/desk`. Authentication and viewer read-only behavior are applied in `app.js`; market-rule writes and send-log deletion additionally require an admin or superadmin role.

| Method   | Path                       | Purpose                                                                               |
| -------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `GET`    | `/api/desk/enquiries`      | List the current executive's enquiries; admins may request `?all=true`                |
| `POST`   | `/api/desk/enquiries/sync` | Bulk upsert enquiries for initial migration/offline sync (up to 200 per request)      |
| `GET`    | `/api/desk/enquiries/:uid` | Read one owned enquiry                                                                |
| `PUT`    | `/api/desk/enquiries/:uid` | Idempotent create/update (partial fields accepted)                                    |
| `POST`   | `/api/desk/enquiries`      | Create/upsert using a client-provided UUID                                            |
| `DELETE` | `/api/desk/enquiries/:uid` | Delete an owned enquiry; logs are retained                                            |
| `POST`   | `/api/desk/send-logs`      | Add an idempotent template-send log; executive comes from the token                   |
| `GET`    | `/api/desk/send-logs`      | Read logs with optional enquiry/template/time filters; admins may request `?all=true` |
| `DELETE` | `/api/desk/send-logs/:uid` | Delete a send log (admin/superadmin)                                                  |
| `GET`    | `/api/desk/market-rules`   | Read configured rules or defaults                                                     |
| `PUT`    | `/api/desk/market-rules`   | Update rules (admin/superadmin)                                                       |

Enquiries are scoped to their owner by default. Desk writes validate IDs and whitelist/clamp accepted fields. The client can retry writes safely using IDs as idempotency keys.

### Additional routing notes

- `routes/report.routes.js` defines report endpoints but is **not mounted** by `app.js` at present. It is not reachable through the current Express route table until mounted.
- Product and sold-item uploads use multipart form data. The product CSV endpoint accepts a single `file` field and limits files to 10 MB.
- The backend has no dedicated health endpoint at the root; AI chat defines its own `/health` endpoint under `/api/ai-chat`.
- Non-API paths fall through to the Angular production entry point. An unknown `/api/...` path is deliberately returned as JSON 404 instead of Angular HTML.

## Data models

Mongoose models are colocated with their domain routes in `core/`. They cover:

- Authentication users and roles
- Customers and customer chat messages
- Product catalogue rows, diamonds, and color stones
- Sold-item records
- Orders, order statuses, categories, counters, and karigars
- Videos, shared links, and favorites
- Sales targets
- Feedback
- CRM Desk enquiries, send logs, and market-pricing rules

Desk-specific top-level models live in `models/`:

- `Enquiry.js` stores owner-scoped customer requests, stage, selected Jewel Codes, search text, and remembered filters.
- `DeskSendLog.js` stores template, enquiry, selected codes, timestamp, and executive.
- `DeskMarketRule.js` stores the editable market-rule document with default values.
- `desk.models.ts` contains TypeScript desk types/constants shared with the frontend; the backend runtime is CommonJS JavaScript.

The product CSV importer groups rows by Jewel Code and constructs nested diamond and stone arrays. Product prices and fields depend on the inventory export schema. Review `core/products/searchProductRoutes.js` and `core/products/searchProductSchema.js` before changing the import mapping.

## Integrations and file storage

### MongoDB

`config/connection.js` opens the Mongoose connection using `MONGO_URI`. Data is persisted in MongoDB collections defined by the Mongoose models.

### Google Sheets

- `utils/googleSheets.service.js` appends and updates order information in a Google Sheet.
- `services/googleSheet.service.js` synchronizes feedback with a Google Sheet.

The database remains the main application data store; the feedback integration treats Sheets sync as best-effort and logs failures.

### AI chat

`routes/aiChatRoutes.js` integrates the Anthropic SDK and MongoDB. Configure `ANTHROPIC_API_KEY` and `MONGO_URI` as required by that route.

### Similar-image search

`core/similar-images/imageSearchRoutes.js` accepts image-search/indexing requests and forwards work to the Python image-search service. Set `PYTHON_SERVICE_URL` when the service is not available at its default local address.

### Uploads and static hosting

- The directory selected by `UPLOADS_DIR` (default `backend/uploads`) is served at `/uploads`.
- Product CSV uploads have a route-specific temporary directory under `core/uploads/csv`.
- Image-search uploads and domain-specific upload flows may use additional route-level storage.
- `public/dist/browser` is the configured Angular production output served by Express. Build the frontend before expecting static application assets to be present.
- Runtime uploads and frontend build output are excluded from version control. Do not put credentials or private data in publicly served directories.

## Project structure

```text
backend/
├── app.js                         # Express entry point, middleware, mounts, static host
├── config/
│   └── connection.js              # MongoDB connection
├── core/
│   ���── auth/
│   │   ├── authRoutes.js
│   │   └── authSchema.js
│   ├── chats/
│   │   ├── chatRoutes.js
│   │   └── chatSchema.js
│   ├── customers/
│   │   ├── customerRoutes.js
│   │   └── customerSchema.js
│   ├── fedback/                   # Directory spelling as in source
│   │   ├── Feedback.model.js
│   │   └── Feedback.routes.js
│   ├── karigars/
│   │   ├── karigarRoutes.js
│   │   └── karigarSchema.js
│   ├── orders/
│   │   ├── categoryRoutes.js
│   │   ├── categorySchema.js
│   │   ├── counterSchema.js
│   │   ├── ordersRoutes.js
│   │   ├── ordersSchema.js
│   │   ├── statusRoutes.js
│   │   └── statusSchema.js
│   ├── products/
│   │   ├── searchProductRoutes.js
│   │   └── searchProductSchema.js
│   ├── sharelinks/
│   │   ├── favoriteListRoutes.js
│   │   ├── favoriteListSchema.js
│   │   ├── shareLinkRoutes.js
│   │   └── shareLinkSchema.js
│   ├── similar-images/
│   │   └── imageSearchRoutes.js
│   ├── solds/
│   │   ├── soldRoutes.js
│   │   └── soldSchema.js
│   ├── targets/
│   │   ├── salestargetRoutes.js
│   │   └── salestargetSchema.js
│   ├── uploads/                   # Route-specific upload area
│   └── videos/
│       ├── videoSchema.js
│       └── videosRoutes.js
├── middleware/
│   ├── checkRoles.js              # Role and active-user authorization helper
│   ├── jwt.js                     # JWT verification and generation
│   └── viewerReadOnly.js          # Restricts viewer accounts to GET requests
├── models/
│   ├── DeskMarketRule.js          # CRM Desk market pricing settings
│   ├── DeskSendLog.js             # CRM Desk send audit records
│   ├── Enquiry.js                 # CRM Desk enquiries
│   └── desk.models.ts             # Shared CRM Desk types/constants
├── routes/
│   ├── aiChatRoutes.js            # Anthropic chat API
│   ├── desk.routes.js             # Enquiries, send logs, market rules
│   └── report.routes.js           # Report routes (currently not mounted)
├── services/
│   └── googleSheet.service.js     # Feedback-to-Sheets integration
├── utils/
│   ├── getTodayDate.js            # Date utility
│   └── googleSheets.service.js    # Order-to-Sheets integration
├── .env / .env.local              # Local configuration; ignored by Git
├── public/
│   └── dist/                      # Angular production build output
├── uploads/                       # Runtime uploads; ignored by Git
├── package.json                   # Scripts and runtime dependencies
├── package-lock.json              # Locked npm dependency graph
└── .gitignore                     # Excludes dependencies, env files, credentials, outputs
```

Local environment and Google credential files are intentionally omitted from the tree. Never include secret values or private customer data in documentation or source control.

## Testing and operational notes

- `npm run dev` starts `nodemon app.js`.
- The package's `test` script is currently a placeholder that exits with “Error: no test specified”; no backend automated test runner is configured.
- The frontend has its own test/build commands in `app/package.json`.
- Use `npm ci` to install the exact versions in the lockfile.
- Confirm MongoDB and any required external services are reachable before diagnosing application-level API errors.
- Uploaded files and the Angular build are runtime/generated data; do not delete or overwrite them as part of routine documentation or source edits.

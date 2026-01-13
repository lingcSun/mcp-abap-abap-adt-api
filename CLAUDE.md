# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **MCP (Model Context Protocol) Server** that bridges AI assistants with SAP ABAP systems via the ADT (ABAP Development Tools) API. It acts as a wrapper around the `abap-adt-api` library, exposing ABAP functionality as MCP tools.

**Status:** Experimental - use with caution.

## Common Commands

```bash
# Build the TypeScript project (outputs to ./dist)
npm run build

# Run the compiled server (stdio-based MCP server)
npm run start

# Run with MCP Inspector for development/debugging
npm run dev

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Environment Configuration

Required environment variables (see `.env.example`):
- `SAP_URL` - SAP server URL
- `SAP_USER` - SAP username
- `SAP_PASSWORD` - SAP password

Optional:
- `SAP_CLIENT` - SAP client number
- `SAP_LANGUAGE` - SAP language code
- `NODE_TLS_REJECT_UNAUTHORIZED` - Set to "0" for self-signed certificates

The ADTClient is initialized in `src/index.ts:70-94` and configured for **stateful sessions** (`session_types.stateful`).

## Architecture

### Modular Handler Pattern

The codebase follows a clean modular architecture with 26 specialized handlers:

```
src/
├── index.ts                 # AbapAdtServer - main MCP server class
├── handlers/
│   ├── BaseHandler.ts       # Abstract base class for all handlers
│   ├── AuthHandlers.ts      # login, logout, dropSession
│   ├── TransportHandlers.ts # transport management (10 tools)
│   ├── ObjectHandlers.ts    # searchObject, objectStructure, etc.
│   ├── ObjectLockHandlers.ts # lock, unLock
│   ├── ObjectSourceHandlers.ts # getObjectSource, setObjectSource
│   ├── CodeAnalysisHandlers.ts # syntaxCheckCode, codeCompletion, etc.
│   ├── ClassHandlers.ts     # classIncludes, classComponents
│   └── [19 more specialized handlers]
├── lib/logger.ts            # Structured logging utility
└── types/tools.ts           # Tool definition interfaces
```

### BaseHandler Pattern

All handlers extend `BaseHandler` which provides:
- **ADTClient injection** - All handlers receive the same stateful ADTClient instance
- **Structured logging** - Via `createLogger(this.constructor.name)`
- **Rate limiting** - 1 request/second per IP (configurable in `checkRateLimit`)
- **Request metrics** - Count, timing, success/error tracking via `trackRequest`

Each handler must implement:
- `getTools()` - Returns array of tool definitions with JSON Schema
- `handle(toolName, args)` - Routes to specific handler methods

### Server Initialization

The `AbapAdtServer` class (`src/index.ts:42-127`):
1. Validates required environment variables (throws if missing)
2. Creates a single ADTClient instance with stateful session mode
3. Instantiates all 26 handlers, injecting the ADTClient
4. Calls `setupToolHandlers()` to register all tools and route requests

### Tool Registration Flow

Tools are registered in two places:
1. **ListToolsRequestSchema** handler (`src/index.ts:176-213`) - Aggregates all tools via `getTools()` for tool discovery
2. **CallToolRequestSchema** handler (`src/index.ts:216-408`) - Routes tool calls to appropriate handler via switch statement

### Error Handling

- All handler methods wrap ADTClient calls in try-catch
- Errors are wrapped in `McpError` with appropriate error codes
- `serializeResult()` handles BigInt serialization for JSON responses
- `handleError()` formats errors consistently for MCP protocol

## ABAP Object Modification Workflow

When modifying ABAP code, follow this sequence (from README.md):

1. `searchObject` - Find object URI (e.g., `/sap/bc/adt/oo/classes/zcl_example`)
2. `getObjectSource` - Read source code (append `/source/main` to URI)
3. Make local modifications (files are NOT synced to SAP)
4. `transportInfo` - Get transport request number
5. `lock` - Lock object (returns `lockHandle`)
6. `setObjectSource` - Write modified code (use `/source/main` suffix)
7. `syntaxCheckCode` - Validate syntax
8. `activate` / `activateObjects` - Activate the object
9. `unLock` - Release lock

**Important:** Local files are decoupled from SAP. Use naming pattern `[ObjectName].[ObjectType].abap` (e.g., `CL_IXML.clas.abap`).

## TypeScript Configuration

- Target: ES2016
- Module: CommonJS
- Strict mode enabled
- Source: `./src` → Output: `./dist`

## Adding a New Handler

1. Create a new handler class extending `BaseHandler` in `src/handlers/`
2. Import `ADTClient` methods from `abap-adt-api`
3. Implement `getTools()` returning tool definitions with JSON Schema
4. Implement `handle(toolName, args)` with switch routing to private methods
5. Use `trackRequest(startTime, success)` in each method
6. Add handler property to `AbapAdtServer` class
7. Instantiate handler in constructor with `this.adtClient`
8. Add tools to `ListToolsRequestSchema` aggregation
9. Add case to `CallToolRequestSchema` switch statement

## Key ADTClient Methods

The `abap-adt-api` library provides the underlying ABAP operations. Handlers typically call methods like:
- `lock(objectUrl, accessMode)` / `unLock(objectUrl, lockHandle)`
- `getObjectSource(objectSourceUrl)` / `setObjectSource(...)`
- `transportInfo(objSourceUrl)`
- `searchObject(query)`
- `syntaxCheckCode(code, url, mainUrl, ...)`

See `abap-adt-api` documentation for full API reference.

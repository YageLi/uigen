# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup       # First-time setup: install deps, generate Prisma client, run migrations
npm run dev         # Start dev server (Turbopack)
npm run build       # Production build
npm run lint        # Run ESLint
npm run test        # Run Vitest tests
npm run db:reset    # Reset the SQLite database
```

Run a single test file:
```bash
npx vitest run src/lib/__tests__/file-system.test.ts
```

## Environment

- `ANTHROPIC_API_KEY` — Required for real AI generation; falls back to `MockLanguageModel` (pre-canned components) without it
- `JWT_SECRET` — Session signing key; defaults to a dev key if unset
- Database: SQLite via Prisma at `prisma/dev.db`

## Architecture

UIGen is an AI-powered React component generator with live preview. Users describe components in chat; Claude generates/edits files in a **virtual filesystem** (in-memory, no disk writes); the preview iframe compiles and renders JSX live.

### Key Data Flow

1. User sends message → `ChatProvider` calls `POST /api/chat` with messages + serialized VFS state
2. Claude responds with tool calls (`str_replace_editor`, `file_manager`)
3. `FileSystemContext` executes tool calls on `VirtualFileSystem`
4. File changes trigger `PreviewFrame` to recompile JSX via Babel standalone and re-render in sandboxed iframe
5. On stream completion, the API route saves chat history + VFS state to the database

### Core Layers

**Virtual File System** (`src/lib/file-system.ts`): In-memory filesystem with `serialize()`/`deserialize()` for database persistence. No disk I/O.

**AI Layer** (`src/app/api/chat/route.ts`): Vercel AI SDK `streamText()` with Anthropic Claude Haiku 4.5 (40 steps max). Two tools defined in `src/lib/tools/`:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`) — view/create/edit files (str_replace, insert operations)
- `file_manager` (`src/lib/tools/file-manager.ts`) — rename/delete files

**AI Provider** (`src/lib/provider.ts`): Returns real Anthropic client if `ANTHROPIC_API_KEY` is set, otherwise `MockLanguageModel` that streams pre-canned Counter/Card/Form components with simulated delays.

**State Management** (React Contexts in `src/lib/contexts/`):
- `FileSystemContext` — wraps `VirtualFileSystem`, exposes file ops, handles AI tool call results, tracks selected file
- `ChatProvider` — wraps Vercel AI's `useChat()`, manages messages, serializes VFS into every request body, routes tool calls to FileSystemContext

**Preview System** (`src/components/preview/PreviewFrame.tsx` + `src/lib/transform/`): Detects entry point (`App.jsx` > `App.tsx` > `index.jsx` > `index.tsx`), builds an import map (local files → blob URLs, third-party → `esm.sh` CDN), compiles JSX with Babel standalone, injects React/ReactDOM/Tailwind, renders in sandboxed iframe.

**Server Actions** (`src/actions/`): `getUser`, `getProjects`, `getProject`, `createProject` — thin async wrappers over Prisma used by server components.

**AI Prompt** (`src/lib/prompts/generation.tsx`): Instructs Claude to always produce `/App.jsx` as root, use Tailwind CSS for styling (no hardcoded styles), use `@/` import alias for project files. This file is a template literal — any inline backticks in the prompt text must be escaped as `\`` to avoid terminating the string.

### UI Layout

Split-panel layout (`react-resizable-panels`):
- Left 35%: Chat interface
- Right 65%: Preview tab (default) or Code tab
  - Code tab: File tree (30%) + Monaco editor (70%)

### Auth

JWT sessions via `jose`, passwords hashed with `bcrypt`. `src/middleware.ts` protects `/api/projects/*` and `/api/filesystem/*` routes. Anonymous sessions are tracked with `src/lib/anon-work-tracker.ts` (sessionStorage) for recovery on sign-up.

### Database Schema

Defined in `prisma/schema.prisma`. Prisma client is generated to `src/generated/prisma` (non-default path).

Two models:
- `User`: id, email, password, timestamps
- `Project`: id, name, optional userId, messages (JSON string), data (JSON string for VFS), timestamps

### Path Aliases

`@/*` maps to `./src/*`.

### UI Components

Shadcn UI ("new-york" style, neutral color, lucide icons) in `src/components/ui/`. Add new Shadcn components with `npx shadcn@latest add <component>`.

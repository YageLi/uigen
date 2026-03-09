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

- Add `ANTHROPIC_API_KEY` to `.env` for real AI generation (falls back to mock/static generation without it)
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

**AI Layer** (`src/app/api/chat/route.ts`): Vercel AI SDK `streamText()` with Anthropic Claude. Two tools:
- `str_replace_editor` — view/create/edit files (str_replace, insert operations)
- `file_manager` — rename/delete files

**State Management** (React Contexts in `src/lib/contexts/`):
- `FileSystemContext` — wraps `VirtualFileSystem`, exposes file ops, handles AI tool call results, tracks selected file
- `ChatProvider` — wraps Vercel AI's `useChat()`, manages messages, routes tool calls to FileSystemContext

**Preview System** (`src/components/preview/PreviewFrame.tsx` + `src/lib/transform/`): Detects entry point (`App.jsx` > `App.tsx` > `index.jsx` > `index.tsx`), builds an import map, compiles JSX with Babel standalone, injects React/ReactDOM/Tailwind, renders in sandboxed iframe.

**AI Prompt** (`src/lib/prompts/generation.tsx`): Instructs Claude to always produce `/App.jsx` as root, use Tailwind CSS for styling (no hardcoded styles), use `@/` import alias for project files.

### UI Layout

Split-panel layout (`react-resizable-panels`):
- Left 35%: Chat interface
- Right 65%: Preview tab (default) or Code tab
  - Code tab: File tree (30%) + Monaco editor (70%)

### Auth

JWT sessions via `jose`, passwords hashed with `bcrypt`. `src/middleware.ts` protects routes. Anonymous sessions are tracked with `src/lib/anon-work-tracker.ts` for recovery on sign-up.

### Database Schema

Defined in `prisma/schema.prisma`. Reference it to understand stored data structure.

Two models:
- `User`: id, email, password, timestamps
- `Project`: id, name, optional userId, messages (JSON), data (JSON for VFS), timestamps

### Path Aliases

`@/*` maps to `./src/*`.

### UI Components

Shadcn UI ("new-york" style, neutral color, lucide icons) in `src/components/ui/`. Add new Shadcn components with `npx shadcn@latest add <component>`.

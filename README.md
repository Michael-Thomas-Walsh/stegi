# vibecoding-starter

Your first project, built together with an AI coding agent. No experience
needed.

## Start here (3 commands)

```bash
npm install
npm run dev
```

Open http://localhost:5173 — you should see a button that stacks tower
floors when you click it. That's the hello world. It works? Great, you're a
developer now.

## Three languages, one page

The whole app is three files — three disciplines, one building:

| File | Language | Role |
|---|---|---|
| `index.html` | HTML — **structure** | walls & rooms: what exists |
| `src/style.css` | CSS — **appearance** | materials & finishes: how it looks |
| `src/main.ts` | TypeScript — **behavior** | building services: what happens on click |

## What are all these files?

| Thing | What it is |
|---|---|
| `index.html` + `src/` | **your app — the only things you edit** |
| `docs/` | the documentation system: your plan (PRD, user stories, a sketch image) and the app's living spec (architecture, frontend) — see `AGENTS.md` |
| `package.json` | the project's ID card: its name + which tools it needs |
| `package-lock.json` | exact versions of those tools (auto-managed, never edit) |
| `node_modules/` | appears after `npm install` — the downloaded tools themselves. Never open it, never edit it. |
| `tsconfig.json` | TypeScript settings (leave as is) |

## Then build something real

1. Open this folder in your AI coding tool (Claude Code, Cline, Copilot…).
2. Say: **"Read AGENTS.md, then help me fill in docs/plan/PRD.md and docs/plan/user-stories.md."**
3. Sketch your UI on paper, photograph it, drop the image into `docs/plan/`.
4. Let the agent translate the plan into `docs/architecture.md` +
   `docs/frontend.md`, then build it step by step.

The agent knows the rules — they're in [AGENTS.md](./AGENTS.md). The short
version: TypeScript + HTML + CSS only, no frameworks, no API keys, PRD and
sketch before code, one small step at a time.

## Need help?

If the dev server won't start: make sure you have Node.js 20+ installed
(https://nodejs.org), then re-run `npm install`. If something else breaks,
paste the error into your agent chat — that's what it's for.

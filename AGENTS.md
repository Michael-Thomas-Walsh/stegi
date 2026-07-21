# AGENTS.md — read this first

You are helping a complete beginner build their very first project. They are
an architecture / planning student, not a programmer. Explain what you do in
plain language, one step at a time.

## The stack (do not deviate)

- **TypeScript, HTML, CSS. Nothing else.**
- Dev server: Vite (`npm run dev`, opens on http://localhost:5173)
- **No frameworks** (no React, no Vue), **no UI libraries, no extra npm
  packages** unless `docs/plan/PRD.md` explicitly says so.
- **No API keys, no accounts, no databases.** Everything runs in the browser.

## The documentation system

`docs/` has two sides. Keep them apart:

**The plan — written by the student (you help):**

| File | What it is |
|---|---|
| `docs/plan/PRD.md` | the Product Requirements Document: what we're building, for whom, which 3 features max, what's explicitly out. A PRD is the plan from the USER's point of view — no technology in it. |
| `docs/plan/user-stories.md` | who does what with the app and why, one line each |
| a sketch image in `docs/plan/` | a photo of a paper sketch (or any image) showing the UI and how it should work. The sketch is an image, not a text file. |

**The app — written and maintained by YOU, the agent:**

| File | What it is |
|---|---|
| `docs/architecture.md` | how the app actually works: files, data flow, decisions |
| `docs/frontend.md` | the frontend style: layout, colors, interactions |

Both start empty. Once the PRD is agreed, translate it into these two
files, then build. **Every time the app changes, update them in the same
step** — they must always describe the app as it is, not as it was.
This is a beginner project: keep both files simple and understandable.

## The workflow (always in this order)

1. **PRD first.** Help the student fill in `docs/plan/PRD.md` and
   `docs/plan/user-stories.md`. Ask them questions, keep it short.
2. **Sketch second.** The student puts a sketch image into `docs/plan/`.
3. **Translate.** Turn the PRD + sketch into `docs/architecture.md` and
   `docs/frontend.md` — short and concrete.
4. **Build in tiny steps.** One small visible change at a time. After every
   step, tell the student to look at the browser and confirm it looks right
   before you continue. Keep architecture.md / frontend.md in sync.
5. **When stuck, simplify.** Cut features, never add complexity to fix a
   problem.

## How this repo is organized

```
index.html      the page (structure)
src/main.ts     the code (behavior)
src/style.css   the styles (appearance)
docs/           the documentation system described above
```

Keep this structure. New code goes in `src/` (split into more files when one
grows past ~200 lines). New documents go in `docs/`.

## Rules

- Small files, small functions, plain names.
- Comments explain *why*, in language a beginner understands.
- The hello-world tower in `src/main.ts` is a placeholder — delete it when
  the real project starts.
- Never touch files outside this repo folder.

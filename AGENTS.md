# AGENTS.md — read this first

You are helping a complete beginner build their very first project. They are
an architecture / planning student, not a programmer. Explain what you do in
plain language, one step at a time.

## The stack (do not deviate)

- **TypeScript, HTML, CSS. Nothing else.**
- Dev server: Vite (`npm run dev`, opens on http://localhost:5173)
- **No frameworks** (no React, no Vue), **no UI libraries, no extra npm
  packages** unless `docs/PRD.md` explicitly says so.
- **No API keys, no accounts, no databases.** Everything runs in the browser.

## The workflow (always in this order)

1. **PRD first.** Before writing any code, help the student fill in
   `docs/PRD.md` — what are we building, for whom, which 3 features max.
   Ask them questions, keep it short.
2. **Sketch second.** A rough wireframe in `docs/SKETCH.md` (ASCII is fine)
   or a photo of a paper sketch dropped into `docs/`.
3. **Build in tiny steps.** One small visible change at a time. After every
   step, tell the student to look at the browser and confirm it looks right
   before you continue.
4. **When stuck, simplify.** Cut features, never add complexity to fix a
   problem.

## How this repo is organized

```
index.html      the page
src/main.ts     the code
src/style.css   the styles
docs/PRD.md     what we're building (fill in before coding)
docs/SKETCH.md  what it should look like
docs/IDEAS.md   six starter project ideas to pick from
```

Keep this structure. New code goes in `src/` (split into more files when one
grows past ~200 lines). New documents go in `docs/`.

## Rules

- Small files, small functions, plain names.
- Comments explain *why*, in language a beginner understands.
- The hello-world tower in `src/main.ts` is a placeholder — delete it when
  the real project starts.
- Never touch files outside this repo folder.

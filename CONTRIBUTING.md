# Contributing

Ship Check is small on purpose. The most useful contributions:

- **A tell we miss.** Open an issue with the line or the page, and why it reads as machine-made.
- **A false alarm.** A flag on honest writing or a designed page. These get fixed first.
- **A broken thing we do not see.** Something a visitor would hit that round 1 lets through.

Run it:

```
npm ci
npm test
npm run dev
```

Rules live in `src/slop.ts` (copy), `src/look.ts` (which Hallmark gates count, and how much) and `src/checks.ts` (works). Read `AGENTS.md` before sending a pull request.

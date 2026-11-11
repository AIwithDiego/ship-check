# Agent instructions

- Read `README.md` and `public/ds.css` before any change. The design system is the only source of colours, type and parts.
- No secrets in code, tests or commits. Tests use no network.
- Exact package versions, no `^`, no `latest`. `mppx` is pinned to 0.17.1.
- Every outbound request goes through `src/fetcher.ts`. Never call `fetch` on an address a caller gave us.
- Never store the page, its text or its address. The live feed holds scores; the address only when the caller gave a name for the board.
- A rule that flags honest writing is worse than no rule. New copy rules come with a test that shows a line it must catch and a line it must leave alone.
- `vendor/hallmark` is someone else's work (MIT). Update it by replacing the file and the commit in `PINNED.txt`, never by editing it.
- Ship Check's own pages must pass Ship Check. Run it on `public/home.html` and `public/live.html` before a PR.
- No em dashes in anything a person reads.

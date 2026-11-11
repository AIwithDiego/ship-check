# Changelog

## Unreleased · 11 Nov 2026 (Agentic Dev Day, Dublin)
- First build. One paid call, three rounds: does it work, does the copy sound machine-written, does the design look machine-made.
- `POST /score` (free): pass or fail per round with the counts. `POST /check` (0.60 USD over Stripe's Machine Payments Protocol): every finding with its fix, and a receipt.
- Round 1 reads the page's HTML and probes what it points at: links, images, scripts, stylesheets, buttons and forms that go nowhere, the basics a phone needs.
- Round 2 is a rule set for English and Spanish. Every flag quotes the line and names the habit.
- Round 3 runs the static gates of Hallmark's sloplint (MIT, Together AI), keeping the gates that are tells on any site.
- Fetching is locked down: public addresses only, checked at connect time and again on every redirect.
- Live screen at `/live` with an opt-in board. Fight-night design system at `/design`.
- The bout: ringing the bell starts a fight between the glove and the slop monster while the check runs. A pass is a knockout, a fail leaves the monster standing. Full screen on the live screen when a paid check lands.
- Named checks show their top three findings per round on the live screen, with a QR code to the home page.
- Pages that answer 4xx or 5xx to our visit are refused before payment. Look round calibrated on sixteen well-known sites.

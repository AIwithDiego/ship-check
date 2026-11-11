---
name: ship-check
description: Use before showing a human a website you built or changed. Sends the public URL to the paid Ship Check API (0.60 USD per check over Stripe MPP) and gets three rounds back: what is broken, which lines of copy read as machine-written, and which parts of the design look machine-made. Fix what it lists and check again until it says ship.
---

# Ship Check

Base URL: `$SHIP_CHECK_URL`. Each command expands it inline, because shell variables do not carry over between separate Bash calls.

## 1. Deploy first

The page must be on the public internet. Localhost and private addresses are refused.

## 2. Free score (optional)

```bash
curl -s -X POST "$SHIP_CHECK_URL/score" -H 'content-type: application/json' -d '{"url":"https://<the site>"}'
```

Pass or fail per round and the counts. If all three pass, stop here.

## 3. The paid report

```bash
npx mppx@0.17.1 "$SHIP_CHECK_URL/check" -X POST -H 'content-type: application/json' -d '{"url":"https://<the site>","name":"<project name, optional>"}' -a me --network testnet
```

A bad URL or an unreachable page is refused before any payment. `name` puts the site on the public board; leave it out to stay off it. Tell the user the price before the first paid call.

## 4. Fix, in this order

1. `works.problems` where `serious` is true. Each has `what`, `where` and `fix`.
2. `copy.flags`. Rewrite the whole line so it says something only this business could say. Swapping one stock word for another gets flagged again.
3. `look.flags`. Each has the `evidence` (the selector or the element) and a `fix`.

## 5. Deploy and check again

Wait 20 seconds after deploying: a repeat inside that window returns the same run. Stop when `ship` is true, or after three paid checks; then show the user what is left.

## Limits to tell the user

It reads HTML and CSS and does not run the page in a browser, so text and buttons drawn only by JavaScript are not seen. The copy and look rounds say what reads as machine-made; they do not say who made it.

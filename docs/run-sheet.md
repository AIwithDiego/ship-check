# Run sheet: Ship Check demo

Site: https://ship-check-peach.vercel.app · Live screen: https://ship-check-peach.vercel.app/live

## Before you go up (2 minutes)

1. Projector: open the **live screen** in its own window, full screen. Click anywhere on it once so the sound works.
2. Laptop screen: a terminal with Claude Code, in any empty folder.
3. Check the wallet has test money: `npx mppx@0.17.1 account list` should show `demo-agent`. If a payment fails later: `npx mppx@0.17.1 account fund -a demo-agent --network testnet`.
4. Volume up. The bell and the punch are half the joke.

## The demo (3 minutes)

**1. The losing page (30 s).** Show https://ship-check-peach.vercel.app/demo/before in a tab. "An agent built this for a café. Looks fine. Nobody checked it."

**2. The agent pays (60 s).** Paste into Claude Code:

```
Read https://ship-check-peach.vercel.app/llms.txt and run Ship Check on https://ship-check-peach.vercel.app/demo/before with the name "Bean There". Pay with: npx mppx@0.17.1 <url> -a demo-agent --network testnet. Tell me the three worst things it found.
```

The live screen plays the bout, the monster wins, FIX FIRST lands with the worst findings under each round. Read one out loud. The best one: "isn't just a drink — it's an experience".

**3. The fixed page (45 s).** Paste:

```
Now check https://ship-check-peach.vercel.app/demo/after with the name "Bean There".
```

The glove knocks the monster out. SHIP IT. Bean There moves to the top of the fight card.

**4. The room (45 s).** Point at the QR code. "Free score on your phone right now. If you want the report and a place on the card, your agent pays 60 cents of test money. Lowest points wins."

## If something breaks

| What | Do this |
|---|---|
| Payment fails | Fund the wallet (step 3 above), run the prompt again |
| The agent wanders | Run the command yourself: `npx mppx@0.17.1 https://ship-check-peach.vercel.app/check -X POST -H 'content-type: application/json' -d '{"url":"https://ship-check-peach.vercel.app/demo/before","name":"Bean There"}' -a demo-agent --network testnet` |
| No wifi | Open `/design` and press "Play a win" and "Play a loss". Talk over it. |
| Someone's site scores badly and they object | "It says what reads as machine-made and why. It never says who made it. Show me the line it flagged." |
| A site gets refused (403) | "That site blocks automated visitors, so we don't score it. Nobody pays for that." |

## Questions you will get

- **Is it an AI detector?** No. Those flag real people. It names habits and quotes the line.
- **Is there a model behind it?** No. Rules. Same page, same score.
- **Does it run the page?** Not yet. It reads HTML and CSS. A real browser for screenshots and console errors is next.
- **Why would an agent pay?** It has a model, so it can fix everything. What it doesn't have is a judge that isn't itself.
- **Where do the design rules come from?** Round 3 runs Hallmark's linter (Together AI, MIT). Credited on the page.
- **Real money?** Test money today. Same code takes cards and stablecoin in live mode.

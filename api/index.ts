// Vercel entry: every request goes to the same Hono app the local server runs.
import { app } from "../src/server.js";

const handler = (req: Request) => app.fetch(req);
export const GET = handler;
export const POST = handler;
export const HEAD = handler;
export const OPTIONS = handler;

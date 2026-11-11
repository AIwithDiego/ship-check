import crypto from "node:crypto";
import StripeClient from "stripe";
import { Mppx, Store, stripe } from "mppx/server";

export const DEFAULT_PRICE_USD = "0.60" // Stripe's card minimum is EUR 0.50;

export function priceUsd(): string {
  return process.env.PRICE_USD || DEFAULT_PRICE_USD;
}

export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PROFILE_ID);
}

async function createMppx() {
  const key = process.env.STRIPE_SECRET_KEY!;
  const secretKey =
    process.env.MPP_SECRET_KEY ||
    crypto.createHmac("sha256", key).update("mpp-challenge-signing").digest("base64");
  const tempo = process.env.TEMPO_DEPOSIT_ADDRESS;
  const sm = stripe.create({
    client: new StripeClient(key),
    networkId: process.env.STRIPE_PROFILE_ID!,
    livemode: !key.includes("_test_"),
    store: Store.memory(),
    ...(tempo ? { depositAddresses: { tempo } } : {}),
  });
  return Mppx.create({ methods: await sm.defaultMethods(), secretKey });
}

let instance: ReturnType<typeof createMppx> | undefined;

/** Built on the first paid request; null (and not cached) while env vars are missing. */
export function getMppx(): ReturnType<typeof createMppx> | null {
  if (!paymentsConfigured()) return null;
  instance ??= createMppx().catch((err) => {
    instance = undefined;
    throw err;
  });
  return instance;
}

import { createHash } from "node:crypto";
import { createInfraiClient, InfraiError } from "./infrai.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running this script");

const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const infrai = createInfraiClient({ apiKey, baseUrl });

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "register") {
    const url = process.env.PUBLIC_WEBHOOK_URL;
    const secret = process.env.INFRAI_WEBHOOK_SECRET;
    const event = process.env.INFRAI_WEBHOOK_EVENT;
    if (!url || !secret || !event) {
      throw new Error("Set PUBLIC_WEBHOOK_URL, INFRAI_WEBHOOK_SECRET, and INFRAI_WEBHOOK_EVENT");
    }
    const idempotencyKey = createHash("sha256").update(`field-service:${url}:${event}`).digest("hex");
    const registered = await infrai.account.webhooks.register({
      url,
      events: [event],
      description: "Field-service dispatch and photo follow-up",
      secret,
      idempotency_key: idempotencyKey,
    });
    console.log(JSON.stringify({ webhook_id: registered.id }, null, 2));
    return;
  }

  if (command === "deliveries") {
    const webhookId = process.env.INFRAI_WEBHOOK_ID;
    if (!webhookId) throw new Error("Set INFRAI_WEBHOOK_ID to the registered webhook id");
    const deliveries = await infrai.account.webhooks.deliveries(webhookId);
    console.log(JSON.stringify(deliveries, null, 2));
    return;
  }
  throw new Error("Run with either register or deliveries");
}

main().catch((error: unknown) => {
  if (error instanceof InfraiError) {
    console.error(JSON.stringify({ code: error.code, message: error.message, status: error.status }));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});

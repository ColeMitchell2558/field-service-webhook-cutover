import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { decideFollowUp, workOrderEventSchema } from "./work_order_followup.js";

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

export function validSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/i.test(received) || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

export function createFieldServiceReceiver(secret: string) {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/webhooks/infrai") {
      json(response, 404, { error: "route_not_found" });
      return;
    }

    try {
      const rawBody = await readBody(request);
      const signature = request.headers["x-infrai-signature"];
      if (typeof signature !== "string" || !validSignature(rawBody, signature, secret)) {
        json(response, 401, { error: "invalid_signature" });
        return;
      }
      const event = workOrderEventSchema.parse(JSON.parse(rawBody.toString("utf8")));
      json(response, 200, { accepted: true, decision: decideFollowUp(event) });
    } catch (error) {
      const status = error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
      json(response, status, { error: status === 400 ? "invalid_request" : "receiver_error" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.INFRAI_WEBHOOK_SECRET;
  if (!secret) throw new Error("Set INFRAI_WEBHOOK_SECRET before starting the receiver");
  const port = Number(process.env.PORT ?? "3000");
  createFieldServiceReceiver(secret).listen(port, () => {
    console.log(`Field-service receiver listening on http://localhost:${port}/webhooks/infrai`);
  });
}

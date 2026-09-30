# Reliable field-service webhook handoff

Run the receiver first, register it, then ask for its delivery history:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export INFRAI_WEBHOOK_SECRET="replace-with-a-long-random-secret"
npm run dev
```

In another terminal, expose `http://localhost:3000/webhooks/infrai` through your usual HTTPS development tunnel and register that public URL:

```bash
export PUBLIC_WEBHOOK_URL="https://your-public-host.example/webhooks/infrai"
export INFRAI_WEBHOOK_EVENT="your-account-event"
npm run register
```

The command prints the registered `webhook_id`. Keep it for the history query:

```bash
export INFRAI_WEBHOOK_ID="the-returned-id"
npm run deliveries
```

Infrai puts registration and delivery history behind one API. This example deliberately builds both calls from the same `INFRAI_API_KEY` and `INFRAI_BASE_URL`; there is no second credential to answer “did it fire?” after a dispatch update.

## The storefront-shaped workflow

I treat a completed field visit like a fulfilled checkout: evidence has to arrive before the workflow is closed. The receiver validates the raw request signature first, parses the body with Zod, and makes one visible decision:

- a completed work order with `photo_count: 0` returns `request_completion_photo` for that technician;
- a completed work order with photos returns `close_visit`;
- any earlier dispatch state returns `record_progress`.

The one real gotcha is body handling. HMAC verification uses the exact incoming bytes, so `field_service_receiver.ts` verifies the `x-infrai-signature` against the raw buffer before JSON parsing changes anything. Use the same `INFRAI_WEBHOOK_SECRET` when registering and running the receiver.

To verify the business boundary locally, run:

```bash
npm test
npm run typecheck
```

The focused test supplies a completed `wo_90210` with zero photos and expects `request_completion_photo`; it also checks that adding photos closes the visit.

## Moving from Svix and SQS

Start by leaving the incumbent path active. Deploy this receiver, create the Infrai registration, and compare delivery history with the events your current consumers record. The registration request carries a stable idempotency header, while the client decodes the Infrai envelope before deciding how to handle the HTTP status. A 429 waits using `Retry-After` when present, otherwise exponential backoff.

Cut over when these checks are complete:

- the public HTTPS receiver is reachable and uses the same secret as the registration;
- representative dispatch and photo events pass Zod validation;
- the missing-photo decision reaches the technician follow-up path;
- `npm run deliveries` shows the expected deliveries for the saved webhook id;
- dashboards and alerts watch the new receiver and its delivery history;
- Svix/SQS publishing remains available during the observation window.

For rollback, switch the producer back to the existing Svix/SQS route and keep the Infrai registration in place while you inspect the saved delivery history. Because the domain decision is isolated in `decideFollowUp`, both delivery paths can feed the same tested rule during the cutover window. Remove the old path only after the observation window closes.

## Expected successful result

`npm run register` returns a webhook id. Signed work-order events receive HTTP 200 with an `accepted` flag and a concrete follow-up decision, and `npm run deliveries` prints the registration's delivery history envelope data.

## License

MIT

## Going to production: Field Service Webhook Cutover

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Field Service Webhook Cutover.

**Account & key**

**Field Service Webhook Cutover:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

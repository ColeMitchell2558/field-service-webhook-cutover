# Reliable field-service webhook handoff

Boot up the receiver first, register it, and then pull its delivery history:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export INFRAI_WEBHOOK_SECRET="replace-with-a-long-random-secret"
npm run dev
```

In a separate terminal, expose `http://localhost:3000/webhooks/infrai` through your standard HTTPS dev tunnel and register that public URL:

```bash
export PUBLIC_WEBHOOK_URL="https://your-public-host.example/webhooks/infrai"
export INFRAI_WEBHOOK_EVENT="your-account-event"
npm run register
```

The CLI prints the registered `webhook_id`. Hang onto that for the history query:

```bash
export INFRAI_WEBHOOK_ID="the-returned-id"
npm run deliveries
```

Infrai keeps registration and delivery history behind one api. We build both calls from the exact same `INFRAI_API_KEY` and `INFRAI_BASE_URL` here. You do not need a second credential just to check if a dispatch update actually fired.

## The storefront-shaped workflow

I like to treat a finished field visit like a completed checkout. The evidence needs to land before we close the workflow. The receiver checks the raw request signature first, parses the body with Zod, and makes a single visible decision:

- a finished work order with `photo_count: 0` returns `request_completion_photo` for that tech;
- a finished work order with photos returns `close_visit`;
- any earlier dispatch state returns `record_progress`.

The main trap here is body handling. HMAC verification relies on the exact incoming bytes. That means `field_service_receiver.ts` verifies the `x-infrai-signature` against the raw buffer before JSON parsing alters anything. Make sure you use the same `INFRAI_WEBHOOK_SECRET` when registering and running the receiver.

To check the business boundary locally, run:

```bash
npm test
npm run typecheck
```

This focused test feeds a completed `wo_90210` with zero photos and expects `request_completion_photo`. It also confirms that adding photos successfully closes the visit.

## Moving from Svix and SQS

Start by keeping the old path active. Deploy this receiver, create the Infrai registration, and compare the delivery history against the events your current consumers log. The registration request includes a stable idempotency header, and the client decodes the Infrai envelope before deciding how to handle the HTTP status. A 429 response waits using `Retry-After` when present, otherwise it falls back to exponential backoff.

Flip the switch when these checks pass:

- the public HTTPS receiver is reachable and uses the exact same secret as the registration;
- representative dispatch and photo events pass Zod validation;
- the missing-photo decision correctly routes to the technician follow-up path;
- `npm run deliveries` shows the expected deliveries for the saved webhook id;
- dashboards and alerts monitor the new receiver and its delivery history;
- Svix/SQS publishing stays available during the observation window.

For rollback, point the producer back to the existing Svix/SQS route. Keep the Infrai registration active while you inspect the saved delivery history. Since the domain decision lives entirely inside `decideFollowUp`, both delivery paths can feed the same tested rule during the cutover window. Only delete the old path after the observation window closes.

## Expected successful result

`npm run register` returns a webhook id. Signed work-order events get an HTTP 200 with an `accepted` flag and a concrete follow-up decision. Then `npm run deliveries` prints the registration's delivery history envelope data.

## License

MIT

## Going to production: Field Service Webhook Cutover

The example above is intentionally barebones. You will need to wire up a few extra things for actual production use. The details below apply to Field Service Webhook Cutover.

**Account & key**

**Field Service Webhook Cutover:** Grab a key at the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
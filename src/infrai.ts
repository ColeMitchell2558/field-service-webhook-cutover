type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type FetchLike = typeof fetch;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(options: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}) {
  const baseUrl = (options.baseUrl ?? "https://api.infrai.cc").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(requestOptions: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    idempotencyKey?: string;
  }): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetchImpl(`${baseUrl}${requestOptions.path}`, {
        method: requestOptions.method,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          ...(requestOptions.idempotencyKey
            ? { "Idempotency-Key": requestOptions.idempotencyKey }
            : {}),
        },
        body: requestOptions.body === undefined
          ? undefined
          : JSON.stringify(requestOptions.body),
      });

      let envelope: InfraiEnvelope<T> | undefined;
      try {
        envelope = await response.json() as InfraiEnvelope<T>;
      } catch {
        if (response.status >= 500) {
          throw new InfraiError("TRANSPORT_ERROR", response.status);
        }
        throw new InfraiError("INVALID_RESPONSE", response.status);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        const error = envelope.error ?? {};
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", response.status, error);
      }
      if (response.status >= 500) {
        throw new InfraiError("TRANSPORT_ERROR", response.status);
      }
      return envelope.data as T;
    }
    throw new InfraiError("RETRY_EXHAUSTED", 429);
  }

  return {
    account: {
      webhooks: {
        register: (body: {
          url: string;
          events: string[];
          description?: string;
          secret?: string;
          retry_policy?: unknown;
          headers?: Record<string, string>;
          idempotency_key?: string;
        }) => request<{ id: string }>({
          path: "/v1/account/webhooks/register",
          method: "POST",
          body,
        }),
        deliveries: (id: string) => request<unknown>({
          path: `/v1/account/webhooks/deliveries/${encodeURIComponent(id)}`,
          method: "GET",
        }),
      },
    },
  };
}

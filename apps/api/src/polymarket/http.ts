import { setTimeout as sleep } from "node:timers/promises";

export type HttpClient = {
  getJson: <T = any>(url: string, opts?: { timeoutMs?: number }) => Promise<T>;
};

export function makeHttpClient(params?: { userAgent?: string; maxRetries?: number }): HttpClient {
  const maxRetries = params?.maxRetries ?? 2;
  const userAgent = params?.userAgent ?? "polystrat/0.1 (read-only)";

  return {
    async getJson<T = any>(url: string, opts?: { timeoutMs?: number }): Promise<T> {
      const timeoutMs = opts?.timeoutMs ?? 10_000;

      let attempt = 0;
      let lastErr: any = null;

      while (attempt <= maxRetries) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), timeoutMs);

          const r = await fetch(url, {
            method: "GET",
            headers: {
              "accept": "application/json",
              "user-agent": userAgent
            },
            signal: controller.signal
          });

          clearTimeout(t);

          // Rate limiting: docs did not specify headers; handle 429 with generic backoff.
          if (r.status === 429) {
            const backoff = backoffMs(attempt);
            await sleep(backoff);
            attempt++;
            continue;
          }

          if (r.status >= 500 && r.status <= 599) {
            const backoff = backoffMs(attempt);
            await sleep(backoff);
            attempt++;
            continue;
          }

          if (!r.ok) {
            const text = await safeText(r);
            throw new Error(`http ${r.status} ${r.statusText} ${text}`);
          }

          return (await r.json()) as T;
        } catch (e: any) {
          lastErr = e;
          // Network/timeout: retry with backoff.
          const backoff = backoffMs(attempt);
          await sleep(backoff);
          attempt++;
        }
      }

      throw lastErr ?? new Error("http_failed");
    }
  };
}

function backoffMs(attempt: number) {
  // conservative exponential backoff + jitter
  const base = Math.min(2000, 250 * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 150);
  return base + jitter;
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

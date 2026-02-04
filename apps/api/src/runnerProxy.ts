import { URL } from "node:url";

const RUNNER_BASE = process.env.RUNNER_URL ?? "http://localhost:3344";

export async function runnerGet(path: string, accessToken?: string) {
  const url = new URL(path, RUNNER_BASE);
  const r = await fetch(url, {
    method: "GET",
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
    }
  });
  const text = await r.text();
  return { status: r.status, text, contentType: r.headers.get("content-type") ?? "application/json" };
}

export async function runnerPost(path: string, body: any, accessToken?: string) {
  const url = new URL(path, RUNNER_BASE);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  return { status: r.status, text, contentType: r.headers.get("content-type") ?? "application/json" };
}

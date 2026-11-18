import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";

const DEFAULT_ENDPOINT = "https://www.bigmodel.cn/api/monitor/usage/quota/limit";
const ENDPOINT_BY_HOST = {
  "open.bigmodel.cn": DEFAULT_ENDPOINT,
  "bigmodel.cn": DEFAULT_ENDPOINT,
  "www.bigmodel.cn": DEFAULT_ENDPOINT,
  "api.z.ai": "https://z.ai/api/monitor/usage/quota/limit",
  "z.ai": "https://z.ai/api/monitor/usage/quota/limit",
};
const CACHE_MS = 60 * 1000;
const TIMEOUT_MS = 15 * 1000;

let cache = null;

function httpsJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { headers, method: "GET", timeout: TIMEOUT_MS }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode || 0, body: JSON.parse(body) });
        } catch {
          resolve({ status: response.statusCode || 0, body: null });
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("查询超时")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchJson(url, headers) {
  if (typeof globalThis.fetch === "function") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch { body = null; }
      return { status: response.status, body };
    } finally {
      clearTimeout(timer);
    }
  }
  return httpsJson(url, headers);
}

function readGatewayConfig() {
  const file = path.join(os.homedir(), ".codex-session-delete", "gateway.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function hostOf(baseUrl) {
  try {
    return new URL(String(baseUrl)).host.toLowerCase();
  } catch {
    return "";
  }
}

function findCredential(config) {
  const manual = String(config?.apiKey || "").trim();
  if (manual) {
    return { key: manual, endpoint: DEFAULT_ENDPOINT, source: "手动配置" };
  }
  const gateway = readGatewayConfig();
  const providers = Array.isArray(gateway?.providers) ? gateway.providers : [];
  for (const provider of providers) {
    const relay = provider?.relay || {};
    const host = hostOf(relay.upstreamBaseUrl || relay.baseUrl || "");
    const endpoint = ENDPOINT_BY_HOST[host];
    if (!endpoint) continue;
    const keys = Array.isArray(relay.apiKeys) ? relay.apiKeys : [];
    const active = keys.find((item) => item && item.id === relay.activeApiKeyId) || keys[0];
    const key = String(active?.apiKey || "").trim();
    if (!key) continue;
    return { key, endpoint, source: `Codex++ 网关 · ${relay.name || relay.id}` };
  }
  return null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(payload) {
  const data = payload?.data;
  const limits = Array.isArray(data?.limits) ? data.limits : [];
  const windows = limits.map((item) => ({
    type: String(item?.type || ""),
    unit: number(item?.unit),
    windowNumber: number(item?.number),
    total: number(item?.usage),
    used: number(item?.currentValue),
    remaining: number(item?.remaining),
    usedPercent: number(item?.percentage),
    resetsAtMs: number(item?.nextResetTime),
  }));
  if (!windows.length) {
    throw new Error("接口没有返回额度窗口，可能不是 Coding Plan Key");
  }
  return { level: data?.level ? String(data.level) : "", windows };
}

export default function createBackend(ctx) {
  return {
    async quota(params = {}) {
      const force = params?.force === true;
      const now = Date.now();
      if (!force && cache && now - cache.fetchedAtMs < CACHE_MS) {
        return { ...cache, cached: true };
      }
      const credential = findCredential(ctx?.config);
      if (!credential) {
        throw new Error("未找到 GLM Coding Plan Key：可在本拓展设置里填写，或在 Codex++ 网关里配置 open.bigmodel.cn 供应商");
      }
      let response;
      try {
        response = await fetchJson(credential.endpoint, {
          "Authorization": `Bearer ${credential.key}`,
          "Accept": "application/json",
        });
      } catch (error) {
        const message = error?.name === "AbortError" ? "查询超时" : (error?.message || "网络错误");
        throw new Error(`连接智谱额度接口失败：${message}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`额度接口返回 HTTP ${response.status}`);
      }
      if (!response.body || typeof response.body !== "object") {
        throw new Error("额度接口返回了无法解析的内容");
      }
      if (response.body.success !== true) {
        throw new Error(response.body.msg ? String(response.body.msg) : `额度接口返回错误码 ${response.body.code ?? "unknown"}`);
      }
      const result = {
        ok: true,
        fetchedAtMs: now,
        keySource: credential.source,
        ...normalize(response.body),
      };
      cache = result;
      return { ...result, cached: false };
    },
    status() {
      const credential = findCredential(ctx?.config);
      return {
        version: "0.1.0",
        credentialFound: !!credential,
        keySource: credential?.source || "",
        cache: cache ? { fetchedAtMs: cache.fetchedAtMs, level: cache.level } : null,
      };
    },
  };
}

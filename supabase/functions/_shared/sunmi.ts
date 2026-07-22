// ---------------------------------------------------------------------------
// Sunmi OpenAPI client (Cloud Printer V2, Cloud-to-Cloud mode)
// Spec: developer docs "Cloud Printer V2 -> 3. API integration development"
//
// Auth (verified):
//   POST JSON to https://openapi.sunmi.com{path}
//   Headers: Sunmi-Appid, Sunmi-Timestamp (10-digit unix), Sunmi-Nonce
//   (6 digits), Source: openapi, and
//   Sunmi-Sign = hex( HMAC-SHA256( body + appid + timestamp + nonce, appkey ) )
//
// Success code is 1 (interface level); 10000 also means success at the
// capability level. Notable errors: 10071400 parameter error,
// 10071704 device not in your channel, 10071705 duplicate trade_no.
// ---------------------------------------------------------------------------

const BASE_URL = "https://openapi.sunmi.com";

export const PATHS = {
  bindShop: "/v2/printer/open/open/device/bindShop",
  unbindShop: "/v2/printer/open/open/device/unbindShop",
  onlineStatus: "/v2/printer/open/open/device/onlineStatus",
  clearPrintJob: "/v2/printer/open/open/device/clearPrintJob",
  pushContent: "/v2/printer/open/open/device/pushContent",
  pushVoice: "/v2/printer/open/open/device/pushVoice",
  printStatus: "/v2/printer/open/open/ticket/printStatus",
} as const;

export interface SunmiResponse {
  code: number | string;
  msg?: string;
  data?: unknown;
}

export class SunmiClient {
  constructor(private appId: string, private appKey: string) {}

  private async sign(body: string, ts: string, nonce: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.appKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body + this.appId + ts + nonce),
    );
    return [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async post(path: string, params: Record<string, unknown>): Promise<SunmiResponse> {
    const body = JSON.stringify(params);
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = Math.floor(100000 + Math.random() * 900000).toString();
    const sig = await this.sign(body, ts, nonce);

    const res = await fetch(BASE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Sunmi-Appid": this.appId,
        "Sunmi-Timestamp": ts,
        "Sunmi-Nonce": nonce,
        "Sunmi-Sign": sig,
        "Source": "openapi",
      },
      body,
    });

    const text = await res.text();
    try {
      return JSON.parse(text) as SunmiResponse;
    } catch {
      throw new Error(`Sunmi ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
  }

  /** Bind a printer (by SN) to a shop id. shop_id MUST be numeric. */
  bindShop(sn: string, shopId: number) {
    return this.post(PATHS.bindShop, { shop_id: shopId, sn });
  }

  unbindShop(sn: string, shopId: number) {
    return this.post(PATHS.unbindShop, { shop_id: shopId, sn });
  }

  onlineStatus(sn: string) {
    return this.post(PATHS.onlineStatus, { sn });
  }

  clearPrintJob(sn: string) {
    return this.post(PATHS.clearPrintJob, { sn });
  }

  /**
   * Push ESC/POS content.
   * trade_no: unique order ref, MAX 32 CHARS (Sunmi de-dupes on it:
   *           10071705 = this trade_no was already pushed).
   * contentHex: hex-encoded UTF-8 ESC/POS bytes (NOT base64).
   * order_type: 1 new order, 2 cancel, 3 urge, 4 chargeback, 5 other.
   */
  pushContent(
    sn: string,
    tradeNo: string,
    contentHex: string,
    count = 1,
    orderType = 1,
  ) {
    return this.post(PATHS.pushContent, {
      sn,
      trade_no: tradeNo.slice(0, 32),
      content: contentHex,
      count,
      order_type: orderType,
    });
  }

  /** Was a given trade_no printed? data.is_print: 0 no, 1 yes, 2 deleted. */
  printStatus(tradeNo: string) {
    return this.post(PATHS.printStatus, { trade_no: tradeNo.slice(0, 32) });
  }

  pushVoice(sn: string, text: string, cycle = 1) {
    return this.post(PATHS.pushVoice, {
      sn,
      content: text,
      expire_in: 300,
      cycle,
      interval: 2,
    });
  }
}

export function ok(r: SunmiResponse): boolean {
  return r.code === 1 || r.code === "1" || r.code === 10000 || r.code === "10000";
}

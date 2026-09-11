// customer-notify — sends a queued customer_notifications row as Web Push and writes it to the app Inbox.
// Deploy as `customer-notify`. Secrets needed (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (e.g. mailto:hello@chocoberry.co.uk) — copy the values the dashboard's send-push already uses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };

let app: webpush.ApplicationServer | null = null;
async function server() {
  if (app) return app;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY")!, priv = Deno.env.get("VAPID_PRIVATE_KEY")!, subject = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@chocoberry.co.uk";
  const keys = await webpush.importVapidKeys({ publicKey: pub, privateKey: priv }, { extractable: false });
  app = await webpush.ApplicationServer.new({ contactInformation: subject, vapidKeys: keys });
  return app;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") || "";
  if (!auth.endsWith(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)) return new Response("forbidden", { status: 403, headers: cors });
  const { notification_id } = await req.json().catch(() => ({}));
  if (!notification_id) return new Response("notification_id required", { status: 400, headers: cors });

  const { data: n } = await admin.from("customer_notifications").select("*").eq("id", notification_id).maybeSingle();
  if (!n || n.status !== "queued") return new Response("nothing to do", { headers: cors });

  // 1. inbox message (always)
  await admin.from("app_messages").insert({ customer_id: n.customer_id, title: n.title, body: n.body, link: n.link });

  // 2. web push to every device the customer has
  const { data: subs } = await admin.from("customer_push_subscriptions").select("*").eq("customer_id", n.customer_id);
  let sent = 0, dead: number[] = [];
  if (subs?.length) {
    const srv = await server();
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.link || "/", tag: n.kind + ":" + (n.order_id || n.id) });
    for (const s of subs) {
      try {
        const sub = srv.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } });
        await sub.pushTextMessage(payload, { ttl: 600, urgency: "high" });
        sent++;
        await admin.from("customer_push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const msg = String(e); if (/410|404|gone|expired/i.test(msg)) dead.push(s.id);
        console.error("push failed", s.id, msg);
      }
    }
    if (dead.length) await admin.from("customer_push_subscriptions").delete().in("id", dead);
  }
  await admin.from("customer_notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", n.id);
  return new Response(JSON.stringify({ ok: true, pushed: sent, devices: subs?.length || 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
});

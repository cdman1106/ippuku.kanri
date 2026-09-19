const SEATS = new Set([
  "C01","C02","C03","C04","C05","C06",
  "T1-01","T1-02","T1-03","T1-04",
  "T2-01","T2-02","T3-01","T3-02"
]);
const STATUSES = new Set(["ordered","preparing","served","paid"]);
const DRINK_CATEGORIES = new Set(["Café","Relax","Refresh"]);
const APP_STATE_KEYS = new Set(["sales","inventory","reserves","promos"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function isNightChargeTimeJst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const mins = hour * 60 + minute;

  // 金・土は13:00〜翌1:00営業。深夜料金は21:00〜翌1:00のみ。
  if (weekday === "Fri") return mins >= 21 * 60;
  if (weekday === "Sat") return mins < 60 || mins >= 21 * 60;
  if (weekday === "Sun") return mins < 60;
  return false;
}

function normalizeItem(item) {
  return {
    name: String(item?.name || "").slice(0, 120),
    displayName: String(item?.displayName || item?.name || "").slice(0, 240),
    category: String(item?.category || "").slice(0, 80),
    price: Math.max(0, Math.round(Number(item?.price || 0))),
    qty: Math.max(1, Math.min(99, Math.round(Number(item?.qty || 1)))),
    option: String(item?.option || "").slice(0, 240)
  };
}

function hasDrinkInItems(items) {
  return items.some((item) => DRINK_CATEGORIES.has(String(item?.category || "")));
}

async function hasDrinkForSeatSession(env, seat, since) {
  let stmt;
  if (since) {
    stmt = env.DB.prepare(
      "SELECT 1 AS ok FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.seat = ? AND o.created_at >= ? AND oi.category IN ('Café','Relax','Refresh') LIMIT 1"
    ).bind(seat, since);
  } else {
    stmt = env.DB.prepare(
      "SELECT 1 AS ok FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.seat = ? AND o.status != 'paid' AND oi.category IN ('Café','Relax','Refresh') LIMIT 1"
    ).bind(seat);
  }
  const row = await stmt.first();
  return !!row;
}

async function ensureAppStateTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS app_state (state_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
}

async function getAppState(env, key) {
  await ensureAppStateTable(env);
  const row = await env.DB.prepare(
    "SELECT value_json, updated_at FROM app_state WHERE state_key = ?"
  ).bind(key).first();
  if (!row) return json({ ok: true, exists: false, key, value: null, updatedAt: null });
  let value = null;
  try { value = JSON.parse(row.value_json); } catch {}
  return json({ ok: true, exists: true, key, value, updatedAt: row.updated_at || null });
}

async function setAppState(request, env, key) {
  if (!APP_STATE_KEYS.has(key)) return json({ ok: false, error: "INVALID_STATE_KEY" }, 400);
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.value)) return json({ ok: false, error: "INVALID_BODY" }, 400);
  if (body.value.length > 5000) return json({ ok: false, error: "STATE_TOO_LARGE" }, 413);
  const now = new Date().toISOString();
  const valueJson = JSON.stringify(body.value);
  await ensureAppStateTable(env);
  await env.DB.prepare(
    "INSERT INTO app_state (state_key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(state_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at"
  ).bind(key, valueJson, now).run();
  return json({ ok: true, key, updatedAt: now });
}

async function ensureSeatAccessTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS seat_access (seat TEXT PRIMARY KEY, is_open INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)"
  ).run();
}

function currentBusinessDayStartIso(date = new Date()) {
  // 営業日はJSTの正午で切り替える。深夜1時までの営業は前営業日扱い。
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  const h = jst.getUTCHours();
  const base = Date.UTC(y, m, h < 12 ? d - 1 : d, 3, 0, 0); // JST 12:00 = UTC 03:00
  return new Date(base).toISOString();
}

async function resetLegacyClosedSeatsOnce(env) {
  await ensureAppStateTable(env);
  await ensureSeatAccessTable(env);
  const key = "seat_access_reset_20260919_v1";
  const row = await env.DB.prepare(
    "SELECT state_key FROM app_state WHERE state_key = ?"
  ).bind(key).first();
  if (row) return;

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE seat_access SET is_open = 1, updated_at = ? WHERE is_open = 0"
  ).bind(now).run();
  // 同時リクエストでもUNIQUE制約エラーにしない。
  await env.DB.prepare(
    "INSERT INTO app_state (state_key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(state_key) DO NOTHING"
  ).bind(key, "true", now).run();
}

function effectiveSeatOpen(row) {
  if (!row) return true;
  const rawOpen = Number(row.is_open) === 1;
  if (rawOpen) return true;
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  const businessStart = new Date(currentBusinessDayStartIso()).getTime();
  // 前営業日の「受付終了」は翌営業日に持ち越さない。
  return !updatedAt || updatedAt < businessStart;
}

async function getSeatAccess(env, seat) {
  await resetLegacyClosedSeatsOnce(env);
  await ensureSeatAccessTable(env);
  const row = await env.DB.prepare(
    "SELECT is_open, updated_at FROM seat_access WHERE seat = ?"
  ).bind(seat).first();
  const open = effectiveSeatOpen(row);
  const updatedAt = row?.updated_at || null;
  return {
    seat,
    open,
    updatedAt,
    drinkOrdered: open ? await hasDrinkForSeatSession(env, seat, updatedAt) : false
  };
}

async function listSeatAccess(env) {
  await resetLegacyClosedSeatsOnce(env);
  await ensureSeatAccessTable(env);
  const result = await env.DB.prepare(
    "SELECT seat, is_open, updated_at FROM seat_access"
  ).all();
  const rows = result.results || [];
  const seats = {};
  const details = {};
  for (const seat of SEATS) {
    seats[seat] = true;
    details[seat] = { open: true, updatedAt: null };
  }
  for (const row of rows) {
    const open = effectiveSeatOpen(row);
    seats[row.seat] = open;
    details[row.seat] = { open, updatedAt: row.updated_at || null };
  }
  return { seats, details };
}

async function setSeatAccess(request, env, seat) {
  if (!SEATS.has(seat)) return json({ ok: false, error: "INVALID_SEAT" }, 400);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.open !== "boolean") {
    return json({ ok: false, error: "INVALID_BODY" }, 400);
  }
  await ensureSeatAccessTable(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO seat_access (seat, is_open, updated_at) VALUES (?, ?, ?) ON CONFLICT(seat) DO UPDATE SET is_open = excluded.is_open, updated_at = excluded.updated_at"
  ).bind(seat, body.open ? 1 : 0, now).run();
  return json({ ok: true, seat, open: body.open, updatedAt: now, drinkOrdered: false });
}

async function getOrder(env, id) {
  const row = await env.DB.prepare(
    "SELECT id, seat, status, total, note, created_at, updated_at FROM orders WHERE id = ?"
  ).bind(id).first();
  if (!row) return null;

  const itemResult = await env.DB.prepare(
    "SELECT name, display_name, category, price, qty, option_text FROM order_items WHERE order_id = ? ORDER BY id ASC"
  ).bind(id).all();

  return {
    id: row.id,
    seat: row.seat,
    status: row.status,
    total: Number(row.total || 0),
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (itemResult.results || []).map((x) => ({
      name: x.name,
      displayName: x.display_name || x.name,
      category: x.category || "",
      price: Number(x.price || 0),
      qty: Number(x.qty || 0),
      option: x.option_text || ""
    }))
  };
}

async function listOrders(request, env) {
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 100)));

  let stmt;
  if (after) {
    stmt = env.DB.prepare(
      "SELECT id, seat, status, total, note, created_at, updated_at FROM orders WHERE created_at > ? ORDER BY created_at DESC LIMIT ?"
    ).bind(after, limit);
  } else {
    stmt = env.DB.prepare(
      "SELECT id, seat, status, total, note, created_at, updated_at FROM orders ORDER BY created_at DESC LIMIT ?"
    ).bind(limit);
  }

  const orderResult = await stmt.all();
  const rows = orderResult.results || [];
  if (!rows.length) return json({ ok: true, orders: [] });

  const ids = rows.map((x) => x.id);
  const placeholders = ids.map(() => "?").join(",");
  const itemsResult = await env.DB.prepare(
    `SELECT order_id, name, display_name, category, price, qty, option_text
     FROM order_items
     WHERE order_id IN (${placeholders})
     ORDER BY id ASC`
  ).bind(...ids).all();

  const byOrder = new Map(ids.map((id) => [id, []]));
  for (const x of (itemsResult.results || [])) {
    if (!byOrder.has(x.order_id)) byOrder.set(x.order_id, []);
    byOrder.get(x.order_id).push({
      name: x.name,
      displayName: x.display_name || x.name,
      category: x.category || "",
      price: Number(x.price || 0),
      qty: Number(x.qty || 0),
      option: x.option_text || ""
    });
  }

  return json({
    ok: true,
    orders: rows.map((row) => ({
      id: row.id,
      seat: row.seat,
      status: row.status,
      total: Number(row.total || 0),
      note: row.note || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: byOrder.get(row.id) || []
    }))
  });
}

async function createOrder(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "INVALID_JSON" }, 400);

  const seat = String(body.seat || "");
  if (!SEATS.has(seat)) return json({ ok: false, error: "INVALID_SEAT" }, 400);

  const access = await getSeatAccess(env, seat);
  if (!access.open) return json({ ok: false, error: "SEAT_CLOSED" }, 403);

  const items = Array.isArray(body.items)
    ? body.items.map(normalizeItem).filter((x) => x.name && x.category !== "Fee")
    : [];
  if (!items.length || items.length > 50) return json({ ok: false, error: "INVALID_ITEMS" }, 400);

  const drinkSatisfied =
    hasDrinkInItems(items) ||
    await hasDrinkForSeatSession(env, seat, access.updatedAt);
  if (!drinkSatisfied) {
    return json({
      ok: false,
      error: "DRINK_REQUIRED",
      message: "店内利用はお一人様ワンドリンクオーダー制です。"
    }, 409);
  }

  const id = crypto.randomUUID();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const note = String(body.note || "").slice(0, 500);
  const subtotal = items.reduce((sum, x) => sum + x.price * x.qty, 0);
  const nightFeeBase = items.reduce((sum, x) => {
    // ZIPPOガチャとThe Cling Lighterガチャは深夜料金の対象外。
    if (x.name === "ZIPPOガチャ" || x.name === "The Cling Lighter ガチャ") return sum;
    return sum + x.price * x.qty;
  }, 0);
  const nightFee = isNightChargeTimeJst(nowDate) ? Math.round(nightFeeBase * 0.10) : 0;
  if (nightFee > 0) {
    items.push({
      name: "深夜料金",
      displayName: "深夜料金（金・土 21時以降10%）",
      category: "Fee",
      price: nightFee,
      qty: 1,
      option: ""
    });
  }
  const total = subtotal + nightFee;

  const statements = [
    env.DB.prepare(
      "INSERT INTO orders (id, seat, status, total, note, created_at, updated_at) VALUES (?, ?, 'ordered', ?, ?, ?, ?)"
    ).bind(id, seat, total, note, now, now)
  ];

  for (const item of items) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO order_items (order_id, name, display_name, category, price, qty, option_text) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, item.name, item.displayName, item.category, item.price, item.qty, item.option)
    );
  }

  await env.DB.batch(statements);
  return json({ ok: true, order: await getOrder(env, id) }, 201);
}

async function updateOrder(request, env, id) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "INVALID_JSON" }, 400);

  const status = String(body.status || "");
  if (!STATUSES.has(status)) return json({ ok: false, error: "INVALID_STATUS" }, 400);

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?"
  ).bind(status, now, id).run();

  if (!result.meta?.changes) return json({ ok: false, error: "NOT_FOUND" }, 404);
  return json({ ok: true, order: await getOrder(env, id) });
}

async function deleteOrder(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM orders WHERE id = ?").bind(id).first();
  if (!existing) return json({ ok: false, error: "NOT_FOUND" }, 404);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
    env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id)
  ]);
  return json({ ok: true });
}

async function handleApi(request, env) {
  if (!env.DB) return json({ ok: false, error: "D1_NOT_BOUND" }, 503);

  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, database: true });
  }
  const stateMatch = url.pathname.match(/^\/api\/state\/(sales|inventory|reserves|promos)$/);
  if (stateMatch && request.method === "GET") {
    return getAppState(env, stateMatch[1]);
  }
  if (stateMatch && request.method === "PUT") {
    return setAppState(request, env, stateMatch[1]);
  }

  if (url.pathname === "/api/seats" && request.method === "GET") {
    return json({ ok: true, ...(await listSeatAccess(env)) });
  }

  const seatMatch = url.pathname.match(/^\/api\/seats\/([^/]+)$/);
  if (seatMatch && request.method === "GET") {
    const seat = decodeURIComponent(seatMatch[1]);
    if (!SEATS.has(seat)) return json({ ok: false, error: "INVALID_SEAT" }, 400);
    return json({ ok: true, ...(await getSeatAccess(env, seat)) });
  }
  if (seatMatch && request.method === "PATCH") {
    return setSeatAccess(request, env, decodeURIComponent(seatMatch[1]));
  }

  if (url.pathname === "/api/orders" && request.method === "GET") {
    return listOrders(request, env);
  }
  if (url.pathname === "/api/orders" && request.method === "POST") {
    return createOrder(request, env);
  }

  const match = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (match && request.method === "PATCH") {
    return updateOrder(request, env, decodeURIComponent(match[1]));
  }
  if (match && request.method === "DELETE") {
    return deleteOrder(env, decodeURIComponent(match[1]));
  }

  return json({ ok: false, error: "NOT_FOUND" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        console.error(error);
        return json({ ok: false, error: "SERVER_ERROR" }, 500);
      }
    }
    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    if (
      url.pathname === "/" ||
      url.pathname.endsWith(".html") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css")
    ) {
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
    }
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers
    });
  }
};

const SEATS = new Set([
  "C01","C02","C03","C04","C05","C06",
  "T1-01","T1-02","T1-03","T1-04",
  "T2-01","T2-02","T3-01","T3-02"
]);
const STATUSES = new Set(["ordered","preparing","served","paid"]);

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

async function ensureSeatAccessTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS seat_access (seat TEXT PRIMARY KEY, is_open INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)"
  ).run();
}

async function getSeatAccess(env, seat) {
  await ensureSeatAccessTable(env);
  const row = await env.DB.prepare(
    "SELECT is_open, updated_at FROM seat_access WHERE seat = ?"
  ).bind(seat).first();
  return {
    seat,
    open: row ? Number(row.is_open) === 1 : true,
    updatedAt: row?.updated_at || null
  };
}

async function listSeatAccess(env) {
  await ensureSeatAccessTable(env);
  const result = await env.DB.prepare(
    "SELECT seat, is_open, updated_at FROM seat_access"
  ).all();
  const rows = result.results || [];
  const bySeat = {};
  for (const seat of SEATS) bySeat[seat] = true;
  for (const row of rows) bySeat[row.seat] = Number(row.is_open) === 1;
  return bySeat;
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
  return json({ ok: true, seat, open: body.open, updatedAt: now });
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

  const id = crypto.randomUUID();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const note = String(body.note || "").slice(0, 500);
  const subtotal = items.reduce((sum, x) => sum + x.price * x.qty, 0);
  const nightFee = isNightChargeTimeJst(nowDate) ? Math.round(subtotal * 0.10) : 0;
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
  if (url.pathname === "/api/seats" && request.method === "GET") {
    return json({ ok: true, seats: await listSeatAccess(env) });
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
    return env.ASSETS.fetch(request);
  }
};

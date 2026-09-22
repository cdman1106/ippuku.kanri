const SEATS = new Set([
  "C01","C02","C03","C04","C05","C06",
  "T1-01","T1-02","T1-03","T1-04",
  "T2-01","T2-02","T3-01","T3-02"
]);
const STATUSES = new Set(["ordered","preparing","served","paid"]);
const DRINK_CATEGORIES = new Set(["Café","Relax","Refresh"]);
const APP_STATE_KEYS = new Set(["sales","inventory","reserves","promos"]);

// Airレジ商品一括編集CSV（2026-09-21）から、現在のモバイルオーダー掲載商品だけを抽出。
// バーコード先頭の # はCSV表示用なので、Airレジ検索へ送る値では外す。
const AIR_BUILTIN_MAP = {
  "紅茶/アイスティー": {"@HOT":"2000000001128","@ICE":"2000000001135"},
  "ミルクティー": {"@HOT":"2000000001142","@ICE":"2000000001159"},
  "抹茶ラテ": {"@HOT":"2000000001180","@ICE":"2000000001197"},
  "ルイボスティー": {"@HOT":"2000000001371","@ICE":"2000000001388"},
  "ゆず蜜": {"@SODA":"2000000001272","@HOT_WATER":"2000000001289","@WATER":"2000000001296"},

  "コーヒー": {"@HOT":"2000000001081","@ICE":"2000000001098"},
  "カフェラテ": {"@HOT":"2000000001104","@ICE":"2000000001111"},
  "ウィンナーコーヒー": {"@HOT":"2000000001227","@ICE":"2000000001234"},
  "キャラメルマキアート": {"@HOT":"2000000001203","@ICE":"2000000001210"},
  "ホワイトモカ": {"":"2000000001241"},
  "カフェ・モカ": {"@HOT":"2000000001258","@ICE":"2000000001265"},
  "チョコチーノ": {"@HOT":"2000000001166","@ICE":"2000000001173"},

  "コーラ": {"":"2000000000237"},
  "みかんジュース": {"":"2000000000176"},
  // 青森りんご100%/炭酸 はWeb 650円 / AirレジCSV 660円のため誤請求防止で未登録。
  "ペリエ": {"":"2000000000183"},
  "モンスター": {"":"2000000000190"},

  "ポパイサンド": {"":"2000000001357"},
  "あんバターサンド": {"":"2000000001364"},
  "チーズケーキ": {"":"2000000001302"},
  "コーヒーゼリーパフェ": {"":"2000000001395"},
  // コーヒーゼリー単品はAirレジCSVに商品が無いため未登録。
  "こんがりワッフル": {"@CHOCO":"2000000001319","@CARAMEL":"2000000001326","@BERRY":"2000000001333"},
  // ダブルはWeb 730円だがAirレジに専用商品が無いので、シングルだけ自動化。
  "濃厚バニラアイス": {"@SINGLE":"2000000001340"},

  "ナッツ": {"":"2000000000251"}
  // ZIPPOガチャ / The Cling Lighter ガチャ はAirレジCSVに検索用バーコードが無いため未登録。
};

function builtinOptionKey(name, optionText) {
  const text = String(optionText || "");
  const upper = text.toUpperCase();

  if ([
    "紅茶/アイスティー","ミルクティー","抹茶ラテ","ルイボスティー",
    "コーヒー","カフェラテ","ウィンナーコーヒー",
    "キャラメルマキアート","カフェ・モカ","チョコチーノ"
  ].includes(name)) {
    if (upper.includes("HOT")) return "@HOT";
    if (upper.includes("ICE")) return "@ICE";
    return "";
  }

  if (name === "ゆず蜜") {
    if (text.includes("炭酸割り")) return "@SODA";
    if (text.includes("お湯割り")) return "@HOT_WATER";
    if (text.includes("水割り")) return "@WATER";
    return "";
  }

  if (name === "こんがりワッフル") {
    if (text.includes("チョコ")) return "@CHOCO";
    if (text.includes("キャラメル")) return "@CARAMEL";
    if (text.includes("ベリー")) return "@BERRY";
    return "";
  }

  if (name === "濃厚バニラアイス") {
    if (text.includes("シングル")) return "@SINGLE";
    if (text.includes("ダブル")) return "@DOUBLE";
    return "";
  }

  return "";
}

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

async function tableColumns(env, table) {
  const result = await env.DB.prepare("PRAGMA table_info(" + table + ")").all();
  return new Set((result.results || []).map((row) => String(row.name)));
}

async function addColumnIfMissing(env, table, columns, name, sql) {
  if (columns.has(name)) return;
  await env.DB.prepare("ALTER TABLE " + table + " ADD COLUMN " + sql).run();
  columns.add(name);
}

async function ensureOrdersTables(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, seat TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ordered', total INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, name TEXT NOT NULL, display_name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL DEFAULT 0, qty INTEGER NOT NULL DEFAULT 1, option_text TEXT NOT NULL DEFAULT '', FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE)"
  ).run();

  // 古いD1テーブルが残っていても、必要な列を自動補修する。
  const ordersCols = await tableColumns(env, "orders");
  await addColumnIfMissing(env, "orders", ordersCols, "status", "status TEXT NOT NULL DEFAULT 'ordered'");
  await addColumnIfMissing(env, "orders", ordersCols, "total", "total INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(env, "orders", ordersCols, "note", "note TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(env, "orders", ordersCols, "created_at", "created_at TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(env, "orders", ordersCols, "updated_at", "updated_at TEXT NOT NULL DEFAULT ''");
  // Existing orders must never be picked up automatically after this deployment.
  // Only orders created after bridge support is deployed are explicitly marked pending.
  await addColumnIfMissing(env, "orders", ordersCols, "bridge_status", "bridge_status TEXT NOT NULL DEFAULT 'legacy'");
  await addColumnIfMissing(env, "orders", ordersCols, "bridge_device", "bridge_device TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(env, "orders", ordersCols, "bridge_claimed_at", "bridge_claimed_at TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(env, "orders", ordersCols, "bridge_completed_at", "bridge_completed_at TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(env, "orders", ordersCols, "bridge_error", "bridge_error TEXT NOT NULL DEFAULT ''");

  const itemCols = await tableColumns(env, "order_items");
  await addColumnIfMissing(env, "order_items", itemCols, "display_name", "display_name TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(env, "order_items", itemCols, "category", "category TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(env, "order_items", itemCols, "price", "price INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(env, "order_items", itemCols, "qty", "qty INTEGER NOT NULL DEFAULT 1");
  await addColumnIfMissing(env, "order_items", itemCols, "option_text", "option_text TEXT NOT NULL DEFAULT ''");

  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_orders_bridge_status ON orders(bridge_status, created_at)").run();

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS air_product_map (name TEXT NOT NULL, option_text TEXT NOT NULL DEFAULT '', air_code TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (name, option_text))"
  ).run();
}

async function hasDrinkForSeatSession(env, seat, since) {
  await ensureOrdersTables(env);
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
  await ensureOrdersTables(env);
  const row = await env.DB.prepare(
    "SELECT id, seat, status, total, note, created_at, updated_at, bridge_status, bridge_device, bridge_claimed_at, bridge_completed_at, bridge_error FROM orders WHERE id = ?"
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
    bridgeStatus: row.bridge_status || "legacy",
    bridgeDevice: row.bridge_device || "",
    bridgeClaimedAt: row.bridge_claimed_at || "",
    bridgeCompletedAt: row.bridge_completed_at || "",
    bridgeError: row.bridge_error || "",
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
  await ensureOrdersTables(env);
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
  await ensureOrdersTables(env);
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

  try {
    await env.DB.prepare(
      "INSERT INTO orders (id, seat, status, total, note, created_at, updated_at, bridge_status) VALUES (?, ?, 'ordered', ?, ?, ?, ?, 'pending')"
    ).bind(id, seat, total, note, now, now).run();

    const itemStatements = items.map((item) =>
      env.DB.prepare(
        "INSERT INTO order_items (order_id, name, display_name, category, price, qty, option_text) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, item.name, item.displayName || item.name, item.category, item.price, item.qty, item.option)
    );
    if (itemStatements.length) await env.DB.batch(itemStatements);

    return json({ ok: true, order: await getOrder(env, id) }, 201);
  } catch (error) {
    // 注文ヘッダーだけ作成された場合は残さない。
    try { await env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id).run(); } catch {}
    try { await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run(); } catch {}
    return json({
      ok: false,
      error: "ORDER_DB_ERROR",
      detail: String(error && error.message ? error.message : error).slice(0, 300)
    }, 500);
  }
}

async function updateOrder(request, env, id) {
  await ensureOrdersTables(env);
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
  await ensureOrdersTables(env);
  const existing = await env.DB.prepare("SELECT id FROM orders WHERE id = ?").bind(id).first();
  if (!existing) return json({ ok: false, error: "NOT_FOUND" }, 404);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
    env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id)
  ]);
  return json({ ok: true });
}

async function resolveAirCode(env, name, optionText) {
  // 1) 管理APIから明示登録した完全一致を最優先。
  const exact = await env.DB.prepare(
    "SELECT air_code FROM air_product_map WHERE name = ? AND option_text = ?"
  ).bind(name, optionText || "").first();
  if (exact?.air_code) return String(exact.air_code).replace(/^#/, "");

  // 2) CSVから抽出したWeb掲載商品の組み込み対応表。
  const builtins = AIR_BUILTIN_MAP[name];
  if (builtins) {
    const key = builtinOptionKey(name, optionText);
    if (key && builtins[key]) return builtins[key];
    if (builtins[""]) return builtins[""];
  }

  // 3) 手動登録の「オプション共通」設定を最後に使用。
  if (optionText) {
    const fallback = await env.DB.prepare(
      "SELECT air_code FROM air_product_map WHERE name = ? AND option_text = ''"
    ).bind(name).first();
    if (fallback?.air_code) return String(fallback.air_code).replace(/^#/, "");
  }
  return "";
}

async function listAirMappings(env) {
  await ensureOrdersTables(env);
  const result = await env.DB.prepare(
    "SELECT name, option_text, air_code, updated_at FROM air_product_map ORDER BY name ASC, option_text ASC"
  ).all();
  return json({
    ok: true,
    mappings: (result.results || []).map((x) => ({
      name: x.name,
      option: x.option_text || "",
      airCode: x.air_code,
      updatedAt: x.updated_at
    }))
  });
}

async function upsertAirMapping(request, env) {
  await ensureOrdersTables(env);
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim().slice(0, 120);
  const optionText = String(body?.option || "").trim().slice(0, 240);
  const airCode = String(body?.airCode || "").trim().slice(0, 64);
  if (!name || !/^[0-9]+$/.test(airCode)) {
    return json({ ok: false, error: "INVALID_MAPPING" }, 400);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO air_product_map (name, option_text, air_code, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(name, option_text) DO UPDATE SET air_code = excluded.air_code, updated_at = excluded.updated_at"
  ).bind(name, optionText, airCode, now).run();
  return json({ ok: true, name, option: optionText, airCode, updatedAt: now });
}

async function claimBridgeOrder(request, env) {
  await ensureOrdersTables(env);
  const body = await request.json().catch(() => ({}));
  const device = String(body?.device || "galaxy").trim().slice(0, 80) || "galaxy";
  const multiItemLearned = body?.multiItemLearned === true;
  const since = currentBusinessDayStartIso();

  // Strict FIFO. Do not skip an older pending order because that would change table order.
  const row = await env.DB.prepare(
    "SELECT id FROM orders WHERE status = 'ordered' AND bridge_status = 'pending' AND created_at >= ? ORDER BY created_at ASC LIMIT 1"
  ).bind(since).first();

  if (!row) return json({ ok: true, order: null });

  const order = await getOrder(env, row.id);
  if (!order) return json({ ok: true, order: null });

  const expanded = [];
  const missingMappings = [];
  for (const item of order.items || []) {
    // 深夜料金などの料金行はAirレジの商品入力対象にしない。
    if (item.category === "Fee") continue;
    const code = await resolveAirCode(env, item.name, item.option || "");
    if (!code) {
      missingMappings.push({
        name: item.name,
        option: item.option || "",
        displayName: item.displayName || item.name
      });
      continue;
    }
    for (let i = 0; i < Math.max(1, Number(item.qty || 1)); i++) {
      expanded.push({
        name: item.name,
        displayName: item.displayName || item.name,
        option: item.option || "",
        airCode: code
      });
    }
  }

  if (missingMappings.length) {
    return json({
      ok: true,
      blocked: true,
      reason: "MAPPING_REQUIRED",
      orderId: order.id,
      seat: order.seat,
      missingMappings
    });
  }

  if (!expanded.length) {
    return json({
      ok: true,
      blocked: true,
      reason: "NO_AIR_ITEMS",
      orderId: order.id,
      seat: order.seat
    });
  }

  // 複数商品は、Galaxy側に保存済みの2商品実機記録がある場合だけ許可する。
  // 旧版Galaxyには従来どおり渡さず、誤伝票を防ぐ。
  if (expanded.length > 1 && !multiItemLearned) {
    return json({
      ok: true,
      blocked: true,
      reason: "MULTI_ITEM_TEMPLATE_REQUIRED",
      orderId: order.id,
      seat: order.seat,
      itemCount: expanded.length
    });
  }

  if (expanded.length > 20) {
    return json({
      ok: true,
      blocked: true,
      reason: "TOO_MANY_ITEMS",
      orderId: order.id,
      seat: order.seat,
      itemCount: expanded.length
    });
  }

  const now = new Date().toISOString();
  const claimed = await env.DB.prepare(
    "UPDATE orders SET bridge_status = 'processing', bridge_device = ?, bridge_claimed_at = ?, bridge_error = '', updated_at = ? WHERE id = ? AND bridge_status = 'pending'"
  ).bind(device, now, now, order.id).run();

  if (!claimed.meta?.changes) return json({ ok: true, order: null });

  return json({
    ok: true,
    order: {
      id: order.id,
      seat: order.seat,
      createdAt: order.createdAt,
      itemCount: expanded.length,
      items: expanded,
      // 旧版Air Bridgeとの後方互換用。
      item: expanded[0]
    }
  });
}

async function finishBridgeOrder(request, env, id, success) {
  await ensureOrdersTables(env);
  const body = await request.json().catch(() => ({}));
  const device = String(body?.device || "").trim().slice(0, 80);
  const error = String(body?.error || "").trim().slice(0, 300);
  const now = new Date().toISOString();

  let result;
  if (success) {
    result = await env.DB.prepare(
      "UPDATE orders SET bridge_status = 'completed', bridge_completed_at = ?, bridge_error = '', updated_at = ? WHERE id = ? AND bridge_status = 'processing'"
    ).bind(now, now, id).run();
  } else {
    // Error is intentionally terminal. Automatic retry could duplicate an Airレジ slip
    // if the UI operation succeeded but the acknowledgement failed.
    result = await env.DB.prepare(
      "UPDATE orders SET bridge_status = 'error', bridge_error = ?, updated_at = ? WHERE id = ? AND bridge_status = 'processing'"
    ).bind(error || "UNKNOWN_ERROR", now, id).run();
  }

  if (!result.meta?.changes) return json({ ok: false, error: "NOT_PROCESSING" }, 409);
  return json({ ok: true, id, bridgeStatus: success ? "completed" : "error", device });
}

async function retryBridgeOrder(env, id) {
  await ensureOrdersTables(env);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE orders SET bridge_status = 'pending', bridge_device = '', bridge_claimed_at = '', bridge_completed_at = '', bridge_error = '', updated_at = ? WHERE id = ? AND bridge_status = 'error'"
  ).bind(now, id).run();
  if (!result.meta?.changes) return json({ ok: false, error: "NOT_ERROR" }, 409);
  return json({ ok: true, id, bridgeStatus: "pending" });
}

async function bridgeStatus(env) {
  await ensureOrdersTables(env);
  const since = currentBusinessDayStartIso();
  const result = await env.DB.prepare(
    "SELECT bridge_status, COUNT(*) AS count FROM orders WHERE created_at >= ? GROUP BY bridge_status"
  ).bind(since).all();
  const counts = {};
  for (const row of (result.results || [])) counts[row.bridge_status || "legacy"] = Number(row.count || 0);
  return json({ ok: true, since, counts });
}

async function handleApi(request, env) {
  if (!env.DB) return json({ ok: false, error: "D1_NOT_BOUND" }, 503);

  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    await ensureOrdersTables(env);
    await ensureSeatAccessTable(env);
    return json({
      ok: true,
      database: true,
      orders: true,
      seats: true,
      orderColumns: Array.from(await tableColumns(env, "orders")),
      itemColumns: Array.from(await tableColumns(env, "order_items"))
    });
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

  if (url.pathname === "/api/bridge/status" && request.method === "GET") {
    return bridgeStatus(env);
  }
  if (url.pathname === "/api/bridge/mappings" && request.method === "GET") {
    return listAirMappings(env);
  }
  if (url.pathname === "/api/bridge/mappings" && request.method === "PUT") {
    return upsertAirMapping(request, env);
  }
  if (url.pathname === "/api/bridge/claim" && request.method === "POST") {
    return claimBridgeOrder(request, env);
  }

  const bridgeOrderMatch = url.pathname.match(/^\/api\/bridge\/orders\/([^/]+)\/(complete|error|retry)$/);
  if (bridgeOrderMatch) {
    const id = decodeURIComponent(bridgeOrderMatch[1]);
    const action = bridgeOrderMatch[2];
    if (action === "complete" && request.method === "POST") return finishBridgeOrder(request, env, id, true);
    if (action === "error" && request.method === "POST") return finishBridgeOrder(request, env, id, false);
    if (action === "retry" && request.method === "POST") return retryBridgeOrder(env, id);
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
        return json({
          ok: false,
          error: "SERVER_ERROR",
          detail: String(error && error.message ? error.message : error).slice(0, 300)
        }, 500);
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

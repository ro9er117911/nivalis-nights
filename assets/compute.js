// Pure functions shared by the page (app.js) and the checker (tools/check.mjs).
// Logic ported from the verified offline tool 盤點表.html.

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
const key = s => String(s || '').trim().toLowerCase();

export function refIndex(ref) {
  const m = new Map();
  for (const r of (ref && ref.ings) || []) m.set(key(r[0]), { name: r[0], base: r[1], shelf: r[2], fridge: !!r[3] });
  return m;
}

// Latest price per (item, vendor), then the cheapest of those.
function cheapestByItem(prices) {
  const latest = new Map();
  for (const p of prices || []) {
    const price = num(p.price);
    if (price === null || price <= 0) continue;
    const k = key(p.item) + '|' + key(p.vendor) + '|' + key(p.district);
    const prev = latest.get(k);
    if (!prev || (num(p.day) ?? -1) >= (num(prev.day) ?? -1)) latest.set(k, p);
  }
  const best = new Map();
  for (const p of latest.values()) {
    const k = key(p.item), cur = best.get(k);
    if (!cur || p.price < cur.price) best.set(k, { price: p.price, vendor: p.vendor || '', district: p.district || '', day: num(p.day) });
  }
  return best;
}

function latestStock(stock) {
  const m = new Map();
  for (const s of stock || []) {
    const k = key(s.item), prev = m.get(k);
    if (!prev || (num(s.day) ?? -1) >= (num(prev.day) ?? -1)) m.set(k, s);
  }
  return m;
}

export function dayNet(d) {
  const parts = [d.revenue, d.ingredient_spend, d.wages, d.rent_interest].map(num);
  return parts.some(v => v === null) ? null : parts[0] - parts[1] - parts[2] - parts[3];
}

export function analyze(data, ref) {
  const R = refIndex(ref);
  const dishes = data.dishes || [];
  const onMenu = dishes.filter(d => d.on_menu);
  const best = cheapestByItem(data.prices);
  const stock = latestStock(data.stock);

  // every ingredient mentioned by any dish, keeping first spelling
  const names = new Map();
  for (const d of dishes) for (const n of Object.keys(d.ingredients || {})) if (!names.has(key(n))) names.set(key(n), n);

  const unitCost = k => {
    const c = best.get(k);
    if (c) return { price: c.price, est: false };
    const r = R.get(k);
    return r ? { price: r.base, est: true } : null;
  };

  const ingredients = [...names.entries()].map(([k, name]) => {
    const qtyIn = d => num(Object.entries(d.ingredients || {}).find(([n]) => key(n) === k)?.[1]) || 0;
    const users = onMenu.filter(d => qtyIn(d) > 0);
    const salesKnown = users.every(d => num(d.sold_per_day) !== null);
    const need = users.length && salesKnown ? users.reduce((s, d) => s + qtyIn(d) * num(d.sold_per_day), 0) : null;
    const st = stock.get(k);
    const onHand = st ? num(st.qty) : null;
    const r = R.get(k) || null;
    const cheapest = best.get(k) || null;
    const daysLeft = need && onHand !== null ? onHand / need : null;
    const flags = [];
    if (need !== null && onHand !== null && onHand < need) flags.push('short');
    if (st && num(st.rotten) > 0) flags.push('rotten');
    if (st && num(st.orange) > 0) flags.push('orange');
    if (users.length === 1) flags.push('single');
    if (!cheapest) flags.push('noprice');
    if (!r) flags.push('unknown');
    return { name, overlap: users.length, dishes: users.map(d => d.name), need, onHand, daysLeft, cheapest, base: r ? r.base : null, shelf: r ? r.shelf : null, fridge: r ? r.fridge : false, flags };
  }).filter(i => i.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.name.localeCompare(b.name));

  const dishRows = dishes.map(d => {
    let cost = 0, est = false, missing = 0;
    for (const [n, q] of Object.entries(d.ingredients || {})) {
      const qq = num(q); if (!qq) continue;
      const u = unitCost(key(n));
      if (!u) { missing++; continue; }
      cost += qq * u.price; if (u.est) est = true;
    }
    const price = num(d.price);
    const margin = price === null ? null : price - cost;
    return { name: d.name, onMenu: !!d.on_menu, price, cost, est, missing, margin, pct: price ? cost / price : null, sold: num(d.sold_per_day) };
  });

  const dailyFood = ingredients.every(i => i.need !== null && (i.cheapest || i.base !== null)) && ingredients.length
    ? ingredients.reduce((s, i) => s + i.need * (i.cheapest ? i.cheapest.price : i.base), 0)
    : null;
  const dailyFoodEst = dailyFood !== null && ingredients.some(i => !i.cheapest);

  const days = (data.days || []).map(d => ({ day: num(d.day), net: dayNet(d), revenue: num(d.revenue), customers: num(d.customers), angry: num(d.angry), rotten: num(d.rotten), change: d.change || '' }))
    .filter(d => d.day !== null).sort((a, b) => a.day - b.day);
  const nets = days.filter(d => d.net !== null);
  const last3 = nets.slice(-3);
  const avgNet3 = last3.length ? last3.reduce((s, d) => s + d.net, 0) / last3.length : null;

  const cashLog = (data.cash_log || []).filter(c => num(c.cash) !== null)
    .sort((a, b) => (num(a.day) ?? 0) - (num(b.day) ?? 0) || String(a.time || '').localeCompare(String(b.time || '')));
  const latestCash = cashLog.length ? cashLog[cashLog.length - 1] : null;

  const alerts = [];
  for (const i of ingredients) {
    const parts = [];
    if (i.flags.includes('short')) parts.push(`今天不夠（要 ${fmt(i.need)}，有 ${fmt(i.onHand)}）`);
    if (i.flags.includes('orange')) parts.push('有快壞的，先用掉或賣給 Farmer');
    if (i.flags.includes('rotten')) parts.push('有爛掉的，清掉騰空間');
    if (parts.length) alerts.push({ level: i.flags.includes('short') ? 'bad' : 'warn', text: `${i.name}：${parts.join('；')}` });
  }
  for (const d of dishRows) if (d.onMenu && d.margin !== null && d.margin <= 0) alerts.push({ level: 'bad', text: `${d.name} 賣一份賠 ${fmt(-d.margin)}` });

  return { latestCash, days, avgNet3, ingredients, dishes: dishRows, dailyFood, dailyFoodEst, alerts, onMenuCount: onMenu.length };
}

export function fmt(v, digits = 2) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r.toLocaleString('en-US', { maximumFractionDigits: digits });
}

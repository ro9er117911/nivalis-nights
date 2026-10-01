import { analyze, fmt } from './compute.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked: fine */ } },
};

async function getJSON(path) {
  const r = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

// ---------- transitions helpers ----------
function popDigits(el, text) {
  const g = document.createElement('span');
  g.className = 't-digit-group';
  const chars = [...text];
  chars.forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 't-digit'; s.textContent = ch;
    if (i === chars.length - 2) s.dataset.stagger = '1';
    else if (i === chars.length - 1) s.dataset.stagger = '2';
    g.appendChild(s);
  });
  el.replaceChildren(g);
  void g.offsetHeight;
  g.classList.add('is-animating');
}
function setKpi(id, skelId, text, sub, subId) {
  const el = $(id);
  if (text === null) { el.textContent = '—'; el.classList.add('is-empty'); }
  else { el.classList.remove('is-empty'); popDigits(el, text); }
  $(subId).textContent = sub;
  $(skelId).classList.add('is-revealed');
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('is-open');
  setTimeout(() => t.classList.remove('is-open'), 3500);
}

// ---------- sections ----------
const bi = (zh, en) => en && en !== zh ? `${esc(zh)} <span class="muted en">${esc(en)}</span>` : esc(zh);
const empty = (what, say) => `<div class="empty"><span>還沒有${esc(what)}。</span><span>傳給 Claude：<b>${esc(say)}</b></span></div>`;

function renderHeader(data) {
  const g = data.game || {};
  $('hudDay').textContent = g.day ? `DAY ${g.day}${g.weekday ? ' · ' + g.weekday : ''}` : 'DAY —';
  const up = new Date(data.updated);
  const ageH = (Date.now() - up.getTime()) / 36e5;
  $('hudUpdated').textContent = '更新 ' + up.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const pill = $('statusPill');
  const hasGame = (data.days || []).length || (data.dishes || []).length || (data.cash_log || []).length;
  if (!hasGame) { pill.className = 'pill wait'; pill.innerHTML = '<span class="dot"></span>等你的第一張截圖　<a href="?demo">看填好的樣子</a>'; }
  else if (ageH > 48) { pill.className = 'pill old'; pill.innerHTML = `<span class="dot"></span>${Math.floor(ageH / 24)} 天沒更新`; }
  else { pill.className = 'pill ok'; pill.innerHTML = '<span class="dot"></span>資料是新的'; }
  $('ticketNo').textContent = `#${String((data.log || []).length).padStart(3, '0')}`;
}

function renderKpis(data, a) {
  const c = a.latestCash;
  setKpi('kCash', 'skelCash', c ? fmt(c.cash) : null, c ? `DAY ${c.day ?? '?'} ${c.time ?? ''}`.trim() : '等 08:00 的 HUD 截圖', 'kCashSub');
  setKpi('kNet', 'skelNet', a.avgNet3 !== null ? fmt(a.avgNet3) : null, a.avgNet3 !== null ? `近 ${Math.min(3, a.days.filter(d => d.net !== null).length)} 天` : '等收盤數字', 'kNetSub');
  const bad = a.alerts.filter(x => x.level === 'bad').length;
  const hasData = a.onMenuCount || a.days.length;
  setKpi('kAlert', 'skelAlert', hasData ? String(a.alerts.length) : null, hasData ? (bad ? `${bad} 個要先處理` : '沒有急事') : '等食譜和庫存', 'kAlertSub');
}

function renderTodo(data) {
  const t = data.todo || [];
  $('todo').innerHTML = t.length
    ? t.map(x => `<li><span>${esc(x.text)}${x.why ? `<span class="why">${esc(x.why)}</span>` : ''}</span></li>`).join('')
    : '<li><span>目前沒有待辦。<span class="why">傳新的截圖給 Claude，它會排下一步。</span></span></li>';
}

function renderAlerts(a, data) {
  if (!a.onMenuCount && !(data.stock || []).length) { $('alerts').innerHTML = empty('食譜和庫存', '這是食譜畫面／這是冰箱'); return; }
  if (!a.alerts.length) { $('alerts').innerHTML = '<div class="empty"><span>目前沒有缺料、快壞或賠錢的菜。</span></div>'; return; }
  const label = { bad: '先處理', warn: '留意' };
  $('alerts').innerHTML = `<ul class="alerts">${a.alerts.map(x => `<li class="${x.level}"><span class="chip">${x.level === 'bad' ? '●' : '▲'} ${label[x.level]}</span><span>${esc(x.text)}</span></li>`).join('')}</ul>`;
}

function renderAsks(data) {
  const asks = [...(data.asks || [])].sort((x, y) => (x.priority ?? 9) - (y.priority ?? 9));
  $('asks').innerHTML = asks.length
    ? asks.map(x => `<li><span>${esc(x.what)}</span>${x.say ? `<button class="say" type="button" data-say="${esc(x.say)}">「${esc(x.say)}」</button>` : ''}${x.why ? `<span class="why">${esc(x.why)}</span>` : ''}</li>`).join('')
    : '<li><span>Claude 目前不缺資料。</span></li>';
}

function renderOverlap(a) {
  if (!a.ingredients.length) { $('overlap').innerHTML = empty('上架菜的食譜', '這是食譜畫面'); return; }
  const tagFor = i => [
    i.flags.includes('short') ? '<span class="tag bad">今天不夠</span>' : '',
    i.flags.includes('orange') ? '<span class="tag warn">快壞</span>' : '',
    i.flags.includes('single') ? '<span class="tag info">只有 1 道用</span>' : '',
    i.flags.includes('unknown') ? '<span class="tag warn">名字對不到</span>' : '',
  ].join('');
  $('overlap').innerHTML = `<div class="table-wrap"><table><thead><tr><th>食材</th><th class="n">幾道菜</th><th class="n">每天要用</th><th class="n">庫存</th><th>最便宜</th><th class="n">壽命格</th></tr></thead><tbody>${
    a.ingredients.map(i => `<tr><td>${bi(i.name, i.en)}<span class="ovl" aria-hidden="true">${'<i></i>'.repeat(Math.min(i.overlap, 8))}</span>${tagFor(i) ? `<div class="tags">${tagFor(i)}</div>` : ''}</td>
      <td class="n">${i.overlap}</td><td class="n">${fmt(i.need)}</td><td class="n">${fmt(i.onHand)}</td>
      <td>${i.cheapest ? `${fmt(i.cheapest.price)} <span class="muted">${esc(i.cheapest.vendor)}${i.cheapest.district ? '·' + esc(i.cheapest.district) : ''}</span>` : (i.base !== null ? `<span class="muted">基準 ${fmt(i.base)}</span>` : '—')}</td>
      <td class="n">${i.shelf ?? '—'}${i.fridge ? ' ❄' : ''}</td></tr>`).join('')
  }</tbody></table></div>
  <p class="muted small">便宜、耐放、很多菜用的，可以多存；貴、易壞、只有 1 道用的，小量常買。</p>`;
}

function renderDishes(a) {
  if (!a.dishes.length) { $('dishes').innerHTML = empty('菜單', '這是食譜畫面'); $('dishNote').textContent = ''; return; }
  const anyEst = a.dishes.some(d => d.est);
  $('dishNote').textContent = anyEst ? '「估」= 用基準價估算，還沒有實際進價' : '';
  $('dishes').innerHTML = `<div class="table-wrap"><table><thead><tr><th>菜</th><th class="n">售價</th><th class="n">食材成本</th><th class="n">毛利</th><th class="n">成本占比</th><th class="n">日賣</th></tr></thead><tbody>${
    a.dishes.map(d => `<tr><td>${bi(d.name, d.en)}${d.onMenu ? '' : ' <span class="muted">（沒上架）</span>'}${d.missing ? ` <span class="tag warn">缺 ${d.missing} 項價</span>` : ''}${d.onMenu && d.margin !== null && d.margin <= 0 ? ' <span class="tag bad">賠錢</span>' : ''}</td>
      <td class="n">${fmt(d.price)}</td><td class="n">${fmt(d.cost)}${d.est ? '<span class="est">估</span>' : ''}</td><td class="n">${fmt(d.margin)}</td>
      <td class="n">${d.pct === null ? '—' : Math.round(d.pct * 100) + '%'}</td><td class="n">${fmt(d.sold)}</td></tr>`).join('')
  }</tbody></table></div>${a.dailyFood !== null ? `<p class="muted small">照日賣份數，每天食材約 ${fmt(a.dailyFood)}${a.dailyFoodEst ? '（含估算）' : ''}。</p>` : ''}`;
}

function renderChart(a) {
  const pts = a.days.filter(d => d.net !== null);
  const box = $('chart');
  if (!pts.length) { box.innerHTML = empty('收盤數字', '這是今天收盤'); return; }
  const W = 560, H = 200, L = 44, Rr = 8, T = 16, B = 26;
  const vals = pts.map(p => p.net);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (lo === hi) hi = lo + 1;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const slot = (W - L - Rr) / pts.length;
  const bw = Math.max(4, Math.min(28, slot - 2));
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  const bars = pts.map((p, i) => {
    const x = L + i * slot + (slot - bw) / 2, y0 = y(0), y1 = y(p.net);
    const top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
    const r = Math.min(4, bw / 2, h);
    // rounded only on the data end, flat on the baseline
    const d = p.net >= 0
      ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z`
      : `M${x},${y0} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + bw - r} Q${x + bw},${top + h} ${x + bw},${top + h - r} V${y0} Z`;
    return `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" data-i="${i}"></rect><path class="bar" d="${d}"></path>`;
  }).join('');
  const last = pts[pts.length - 1], li = pts.length - 1;
  const lx = L + li * slot + slot / 2, ly = last.net >= 0 ? y(last.net) - 6 : y(last.net) + 14;
  const every = Math.ceil(pts.length / 8);
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每日淨利長條圖，共 ${pts.length} 天">
    <g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}"></line>`).join('')}</g>
    <g class="axis">${ticks.map(v => `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`).join('')}
      ${pts.map((p, i) => i % every === 0 || i === li ? `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">D${p.day}</text>` : '').join('')}</g>
    <line class="zero" x1="${L}" x2="${W - Rr}" y1="${y(0)}" y2="${y(0)}"></line>
    ${bars}
    <text class="lbl" x="${lx}" y="${ly}" text-anchor="middle">${fmt(last.net, 0)}</text>
  </svg><div class="tip" hidden></div>
  <details class="small"><summary class="muted">看表格</summary><div class="table-wrap"><table><thead><tr><th>天</th><th class="n">淨利</th><th class="n">客數</th><th class="n">生氣</th><th>那天改了</th></tr></thead><tbody>${
    pts.map(p => `<tr><td>DAY ${p.day}</td><td class="n">${fmt(p.net)}</td><td class="n">${fmt(p.customers)}</td><td class="n">${fmt(p.angry)}</td><td>${esc(p.change)}</td></tr>`).join('')}</tbody></table></div></details>`;
  const tip = box.querySelector('.tip'), svg = box.querySelector('svg');
  box.querySelectorAll('.hit').forEach(h => {
    const p = pts[+h.dataset.i];
    const show = () => {
      const r = svg.getBoundingClientRect(), b = h.getBoundingClientRect();
      tip.innerHTML = `DAY ${p.day}<br>淨利 ${fmt(p.net)}${p.change ? `<br>${esc(p.change)}` : ''}`;
      tip.style.left = `${b.left - r.left + b.width / 2}px`;
      tip.style.top = `${(p.net >= 0 ? y(p.net) : y(0)) / H * r.height}px`;
      tip.hidden = false;
    };
    h.addEventListener('pointerenter', show);
    h.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
}
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function renderLog(data) {
  const log = [...(data.log || [])].reverse();
  $('logCount').textContent = `${log.length} 筆`;
  $('log').innerHTML = log.map(l => `<li><span class="mono">${esc(l.date)}</span> ${esc(l.note)}</li>`).join('') || '<li>還沒有紀錄</li>';
}

// ---------- reference (registry) ----------
let REG = { items: [] }, refSort = 'name';
function renderRef() {
  const q = $('refQ').value.trim().toLowerCase(), kind = $('refKind').value;
  const hit = it => !q || [it.en, it.zh, it.zh_cn, ...(it.alias || [])].some(s => String(s || '').toLowerCase().includes(q));
  let rows = REG.items.filter(it => it.kind === kind && hit(it));
  if (refSort === 'price') rows = [...rows].sort((a, b) => (b.base ?? 0) - (a.base ?? 0) || a.en.localeCompare(b.en));
  else if (refSort === 'life') rows = [...rows].sort((a, b) => (a.shelf ?? 1e9) - (b.shelf ?? 1e9) || a.en.localeCompare(b.en));
  else rows = [...rows].sort((a, b) => a.en.localeCompare(b.en));
  $('refBody').innerHTML = rows.slice(0, 300).map(it => `<tr><td>${esc(it.zh)}${it.zh_ok ? '' : ' <span class="muted">＊</span>'}${(it.alias || []).length ? `<div class="muted small">也叫 ${it.alias.map(esc).join('、')}</div>` : ''}</td><td>${esc(it.en)}</td><td class="n">${it.kind === 'dish' ? '—' : fmt(it.base)}</td><td class="n">${it.shelf ?? '—'}</td><td>${it.fridge ? '❄ 要' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">找不到</td></tr>';
}

function renderStaff(data) {
  const s = data.staff || [], hm = data.game ? data.game.has_manager : null;
  $('staffNote').textContent = hm === true ? '有 manager' : hm === false ? '沒有 manager' : '';
  if (!s.length && hm == null) { $('staff').innerHTML = empty('員工資料', '這是員工畫面'); return; }
  const role = { cook: '廚師', waiter: '服務生', cleaner: '清潔', manager: 'manager' };
  const wages = s.map(x => x.wage_per_hour).filter(v => typeof v === 'number');
  $('staff').innerHTML = s.length ? `<div class="table-wrap"><table><thead><tr><th>名字</th><th>職位</th><th class="n">時薪</th><th>班表</th></tr></thead><tbody>${
    s.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(role[x.role] || x.role || '—')}</td><td class="n">${fmt(x.wage_per_hour ?? null)}</td><td class="mono">${esc(x.hours || '—')}</td></tr>`).join('')}</tbody></table></div>${wages.length ? `<p class="muted small">已知時薪合計 ${fmt(wages.reduce((a, b) => a + b, 0))}／小時。</p>` : ''}`
    : '<div class="empty"><span>還沒有每個員工的資料。</span><span>傳給 Claude：<b>這是員工畫面</b></span></div>';
}

// ---------- wiring ----------
document.addEventListener('click', e => {
  const head = e.target.closest('.t-acc-head');
  if (head) {
    const acc = head.closest('.t-acc'), open = acc.getAttribute('data-open') === 'true';
    acc.setAttribute('data-open', String(!open)); head.setAttribute('aria-expanded', String(!open));
    return;
  }
  const say = e.target.closest('.say');
  if (say) {
    const text = say.dataset.say;
    const done = () => toast(`已複製：${text}`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => toast(`請自己打：${text}`));
    else toast(`請自己打：${text}`);
  }
});
$('refQ').addEventListener('input', renderRef);
$('refSort').addEventListener('change', e => { refSort = e.target.value; renderRef(); });
$('refKind').addEventListener('change', renderRef);

async function main() {
  try {
    const demo = new URLSearchParams(location.search).has('demo');
    const [data, reg, vendors] = await Promise.all([getJSON(demo ? 'tools/demo.json' : 'data.json'), getJSON('ref/registry.json'), getJSON('ref/vendors.json')]);
    REG = reg;
    const a = analyze(data, reg);
    renderHeader(data); renderKpis(data, a); renderTodo(data); renderAlerts(a, data); renderStaff(data); renderAsks(data);
    renderOverlap(a); renderDishes(a); renderChart(a); renderLog(data); renderRef();
    $('vendors').innerHTML = Object.entries(vendors.vendors).map(([k, v]) => `<li><b>${esc(k)}</b>（${v.length} 區）：${v.map(esc).join('、')}</li>`).join('');
    if (demo) {
      $('statusPill').className = 'pill old';
      $('statusPill').innerHTML = '<span class="dot"></span>範例資料，不是你的　<a href="./">回到我的</a>';
      return;
    }
    const seen = store.get('nivalis-seen');
    if (seen && seen !== data.updated) toast(`資料已更新：${$('hudUpdated').textContent.replace('更新 ', '')}`);
    store.set('nivalis-seen', data.updated);
  } catch (err) {
    $('statusPill').className = 'pill old';
    $('statusPill').textContent = '讀不到資料';
    ['skelCash', 'skelNet', 'skelAlert'].forEach(id => $(id).classList.add('is-revealed'));
    $('todo').innerHTML = `<li><span>資料讀取失敗：${esc(err.message)}<span class="why">請 Claude 跑 node tools/check.mjs 看 data.json 哪裡壞了。</span></span></li>`;
  }
}
main();

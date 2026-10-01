// Run before every push:  node tools/check.mjs
// 1) data.json shape  2) compute regression test  3) summary of what the page will show
import { readFileSync } from 'node:fs';
import { analyze, fmt, refIndex } from '../assets/compute.js';

const root = new URL('..', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const errors = [], warns = [];
const isNum = v => typeof v === 'number' && isFinite(v);
const numOrNull = (v, where) => { if (v !== null && v !== undefined && !isNum(v)) errors.push(`${where}: 要是數字或 null，現在是 ${JSON.stringify(v)}`); };

let data, reg;
try { data = read('data.json'); } catch (e) { console.error('data.json 讀不了：' + e.message); process.exit(1); }
reg = read('ref/registry.json');
const { resolve } = refIndex(reg);
const nameCheck = (n, kind, where) => {
  const r = resolve(n, kind);
  if (!r) warns.push(`${where}「${n}」不在登記表（用遊戲英文名，或把這個中文名加進 ref/registry.json 的 alias）`);
  else if (r.ambiguous) errors.push(`${where}「${n}」對到多筆：${r.ambiguous.map(i => i.en).join(' / ')}，請改用英文名`);
};

// ---- shape ----
if (data.schema !== 1) errors.push('schema 要是 1');
if (!data.updated || isNaN(Date.parse(data.updated))) errors.push('updated 要是 ISO 日期時間，例如 2026-10-02T21:30:00+08:00');
for (const k of ['cash_log', 'days', 'dishes', 'stock', 'prices', 'staff', 'todo', 'asks', 'log']) if (!Array.isArray(data[k])) errors.push(`${k} 要是陣列`);
if (typeof data.game !== 'object' || data.game === null) errors.push('game 要是物件');
else numOrNull(data.game.day, 'game.day');

(data.cash_log || []).forEach((c, i) => { numOrNull(c.day, `cash_log[${i}].day`); if (!isNum(c.cash)) errors.push(`cash_log[${i}].cash 要是數字`); });
(data.days || []).forEach((d, i) => {
  if (!isNum(d.day)) errors.push(`days[${i}].day 要是數字`);
  for (const f of ['revenue', 'ingredient_spend', 'wages', 'rent_interest', 'customers', 'angry', 'rating', 'rotten']) numOrNull(d[f], `days[${i}].${f}`);
});
const days = (data.days || []).map(d => d.day);
if (new Set(days).size !== days.length) errors.push('days 裡有重複的 day');

const names = new Set();
(data.dishes || []).forEach((d, i) => {
  if (!d.name) errors.push(`dishes[${i}].name 不能空`);
  if (names.has(d.name)) errors.push(`dishes 菜名重複：${d.name}`); names.add(d.name);
  numOrNull(d.price, `dishes[${i}].price`); numOrNull(d.sold_per_day, `dishes[${i}].sold_per_day`);
  if (typeof d.on_menu !== 'boolean') errors.push(`dishes[${i}].on_menu 要是 true/false`);
  if (typeof d.ingredients !== 'object' || d.ingredients === null) errors.push(`dishes[${i}].ingredients 要是物件 {食材: 數量}`);
  else for (const [n, q] of Object.entries(d.ingredients)) {
    if (!isNum(q) || q <= 0) errors.push(`dishes[${i}] ${d.name} 的 ${n} 數量要是正數`);
    nameCheck(n, 'ingredient', `${d.name} 的食材`);
  }
  if (d.name) nameCheck(d.name, 'dish', '菜名');
});
(data.stock || []).forEach((s, i) => {
  if (!s.item) errors.push(`stock[${i}].item 不能空`); else nameCheck(s.item, 'ingredient', '庫存');
  for (const f of ['qty', 'orange', 'rotten', 'day']) numOrNull(s[f], `stock[${i}].${f}`);
});
(data.prices || []).forEach((p, i) => {
  if (!p.item) errors.push(`prices[${i}].item 不能空`); else nameCheck(p.item, 'ingredient', '價格');
  if (!isNum(p.price)) errors.push(`prices[${i}].price 要是數字`);
  if (!p.vendor) errors.push(`prices[${i}].vendor 不能空（例如 Butcher）`);
  numOrNull(p.day, `prices[${i}].day`);
});
if (data.game && ![true, false, null, undefined].includes(data.game.has_manager)) errors.push('game.has_manager 要是 true / false / null');
(data.staff || []).forEach((s, i) => {
  if (!s.name) errors.push(`staff[${i}].name 不能空`);
  if (s.role && !['cook', 'waiter', 'cleaner', 'manager'].includes(s.role)) errors.push(`staff[${i}].role 要是 cook / waiter / cleaner / manager`);
  numOrNull(s.wage_per_hour, `staff[${i}].wage_per_hour`);
});
(data.todo || []).forEach((t, i) => { if (!t.text) errors.push(`todo[${i}].text 不能空`); });
(data.asks || []).forEach((a, i) => { if (!a.what) errors.push(`asks[${i}].what 不能空`); });

// ---- regression: numbers verified on the offline tool ----
const fx = analyze(read('tools/fixture.json'), { items: [] });
const by = Object.fromEntries(fx.ingredients.map(i => [i.name, i]));
const dish = Object.fromEntries(fx.dishes.map(d => [d.name, d]));
const expect = (label, got, want) => { if (got !== want) errors.push(`回歸測試失敗：${label} 應為 ${want}，得到 ${got}`); };
expect('Onion 用量', by.Onion?.need, 35); expect('Chicken 用量', by.Chicken?.need, 50); expect('Noodle 用量', by.Noodle?.need, 20);
expect('Onion 幾道菜', by.Onion?.overlap, 2); expect('Noodle 幾道菜', by.Noodle?.overlap, 1);
expect('每日食材', fx.dailyFood, 450);
expect('Soup 成本', dish.Soup?.cost, 12); expect('Fried 成本', dish.Fried?.cost, 14); expect('Salad 成本', dish.Salad?.cost, 6);
expect('Day5 淨利', fx.days[0]?.net, 100);
expect('Onion 不夠', by.Onion?.flags.includes('short'), true);

// ---- report ----
const a = analyze(data, reg);
// registry self-check: the bilingual mapping must resolve real names
const probe = (n, kind, en) => { const r = resolve(n, kind); if (!r || !r.item || r.item.en !== en) errors.push(`登記表壞了：「${n}」應對到 ${en}`); };
probe('洋蔥', 'ingredient', 'Onions'); probe('Onions', 'ingredient', 'Onions'); probe('洋葱', 'ingredient', 'Onions'); probe('馬鈴薯', 'ingredient', 'Potatoes'); probe('雞肉拉麵', 'dish', 'Chicken Noodle Soup');
console.log(`資料更新：${data.updated}｜遊戲第 ${data.game?.day ?? '?'} 天`);
console.log(`上架菜 ${a.onMenuCount} 道｜用到食材 ${a.ingredients.length} 種｜警示 ${a.alerts.length}｜收盤紀錄 ${a.days.length} 天｜近 3 天平均淨利 ${fmt(a.avgNet3)}`);
if (a.ingredients.length) console.log('重疊前 5：' + a.ingredients.slice(0, 5).map(i => `${i.name}×${i.overlap}`).join('、'));
warns.forEach(w => console.log('⚠ ' + w));
if (errors.length) { errors.forEach(e => console.error('✗ ' + e)); console.error(`\n${errors.length} 個錯誤，先修再推。`); process.exit(1); }
console.log('✓ 檢查通過，可以 commit + push。');

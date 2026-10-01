# 夜城營運板：更新規則

這是使用者玩 Nivalis Nights（夜城狂想）的營運看板，部署在 GitHub Pages。
**使用者不在網頁上輸入。** 他傳遊戲截圖＋一句話（或口述數字）給你，你改 `data.json` 後推上去。

## 鐵律

- 只寫截圖或使用者親口說的數字。看不清楚就寫 `null`，並在回覆裡問。不要猜、不要補。
- 每筆紀錄的 `src` 寫來源，例如 `"食譜截圖 2026-10-02"`、`"口述"`。
- 使用者玩的是**繁體中文版**，截圖上是中文名。名字一律照下面「中英對照」處理。
- 遊戲日在 **08:00** 換日。現金以每天 08:00 的 HUD 為準。
- 這個 repo 是公開的。不要放使用者的個人資訊。
- 不要改 `tools/fixture.json` 的數字。它是回歸測試。

## 中英對照（`ref/registry.json`，上游登記表）

每個物品一筆：`en`（英文 id）、`zh`（繁中名）、`zh_cn`（遊戲簡中名）、`zh_ok`（是否已用使用者截圖確認）、`alias`（其他叫法）、`kind`（ingredient / dish / seed）、`base`、`shelf`、`fridge`。`compute.js` 會把 en、zh、zh_cn、alias 都對到同一筆，所以 `data.json` 寫中文或英文都算得對。

- `data.json` 裡**一律寫 `en`**（例如 `"Onions"`），比較穩。
- 截圖上的中文 → 在登記表找。找到但 `zh` 跟截圖寫法不同：把 `zh` 改成截圖寫法、`zh_ok` 改 `true`，舊寫法放進 `alias`。找到且一樣：只把 `zh_ok` 改 `true`。
- 找不到：用 `zh_cn`、英文意思、價格推一個候選，**問使用者確認**後再加進 `alias`。不要自己決定。
- 使用者口述的叫法（例如「馬鈴薯」）也加進 `alias`。
- 已知陷阱：「麵包」同時是 Bread 和 Toast（check 會擋，改寫英文）；簡中「黃油」= Butter、簡中「奶油」= Cream，繁中版可能顛倒，看價格分辨（Butter 3.0、Cream 2.0）。
- 改完登記表也要跑 `node tools/check.mjs`。

## 截圖 → 欄位

| 使用者說 | 改哪裡 | 一筆長這樣 |
|---|---|---|
| 「這是食譜畫面」 | `dishes[]` | `{"name":"Chicken Noodle Soup","price":23,"on_menu":true,"sold_per_day":null,"ingredients":{"Chicken":1,"Onions":1,"Ramen Noodles":1},"equipment":["Cooker"],"src":"食譜截圖 10/02"}` |
| 「這是今天收盤」或 HUD | `days[]`、`cash_log[]` | `days`: `{"day":5,"revenue":820,"ingredient_spend":245,"wages":260,"rent_interest":120,"customers":40,"angry":2,"rating":4.1,"rotten":1,"change":"飲料 +2","src":"收盤截圖"}`；`cash_log`: `{"day":5,"time":"08:00","cash":512.8,"src":"HUD"}` |
| 「這是冰箱／庫存」 | `stock[]` | `{"item":"Onions","qty":30,"orange":4,"rotten":0,"day":5}` |
| 「這是 ○○ 的價格」 | `prices[]` | `{"item":"Chicken","vendor":"Butcher","district":"Lowtown","price":4.9,"day":5,"deal":"-5%"}`。`price` 填畫面上的最終價 |
| 「這是員工畫面」 | `staff[]`、`game.has_manager` | `{"name":"Banor","role":"cook","wage_per_hour":12,"hours":"10-22","mood":"green"}`；`role` 只能是 cook / waiter / cleaner / manager |
| 說了今天改了什麼 | 當天 `days[].change` | 一天只記一項改動 |

- 同一天同一項，直接改那筆，不要重複新增。`days[].day` 不能重複。
- 營收、花費如果遊戲沒顯示，就留 `null`，用 `cash_log` 的差額說明給使用者聽。
- 一道菜只要有一項食材沒數量，就先不放 `ingredients` 裡那一項，在 `asks` 補一條要截圖。

## 每次更新的步驟

1. 改 `data.json`：上表的欄位、`updated`（台北時間 ISO，例如 `2026-10-02T21:30:00+08:00`）、`game.day`。
2. 重排 `todo`：最多 5 條。先放網頁「要注意」裡紅色的項目，再放下一步。每條要有 `why`。
3. 重排 `asks`：還缺什麼截圖，`priority` 1 最重要，`say` 寫使用者可以直接講的一句話。
4. `log` 加一筆：`{"date":"2026-10-02","note":"DAY 5 收盤＋食譜 3 道"}`。
5. 跑檢查，必須通過：

   ```bash
   node tools/check.mjs
   ```

6. 推上去：

   ```bash
   git add -A && git commit -m "data: DAY 5 收盤＋食譜" && git push
   ```

7. 約 1 分鐘後確認上線：

   ```bash
   curl -s "https://ro9er117911.github.io/nivalis-nights/data.json?t=$(date +%s)" | head -c 200
   ```

   GitHub Pages 每個檔案快取 10 分鐘。改了 `assets/` 或刪了檔案之後，舊分頁最多 10 分鐘內可能顯示「讀不到資料」；重新整理或等它過期即可，不是壞掉。

8. 回覆使用者時說清楚：你記了哪些數字、哪些看不清楚留了 `null`、網頁現在提醒什麼。

## 檔案

- `data.json`：唯一的資料來源。
- `assets/compute.js`：所有計算（重疊、每天用量、最便宜、毛利、警示）。網頁和 `check.mjs` 共用。
- `assets/app.js`、`assets/app.css`、`index.html`：畫面。動畫用 transitions.dev 的 token 與配方，都有 `prefers-reduced-motion` 保護。
- `ref/registry.json`：中英對照登記表（515 筆）。中文來自 `Vesper0802/Nivalis_console` 的遊戲簡中顯示名，用 macOS ICU `Hans-Hant` 轉繁體；台灣用語另放 `alias`。價格是基準價，不是實際進價；`shelf` 來自 `HiveSolution/nivalis-save-editor`，單位未定（8 小時或 1 天）。
- `ref/vendors.json`：商人名單（只有名字和區）。
- `tools/demo.json`：範例資料，網址加 `?demo` 會看到。不要把真資料寫進去。
- `.nojekyll`：讓 GitHub Pages 不跑 Jekyll。不要刪。

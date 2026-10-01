# 夜城營運板

Nivalis Nights（夜城狂想）麵攤的營運看板：現金、每日淨利、食材重疊、缺料警示、下一步該做什麼。

- 網站：https://ro9er117911.github.io/nivalis-nights/
- 範例：https://ro9er117911.github.io/nivalis-nights/?demo

## 怎麼更新

在遊戲裡截圖，貼給 Claude，說一句它是什麼畫面（例如「這是食譜畫面」）。Claude 會照 `CLAUDE.md` 改 `data.json`、跑檢查、推上來。約 1 分鐘後重新整理網站。

## 開發

```bash
node tools/check.mjs
```

```bash
python3 -m http.server 8777
```

動畫參考 [transitions.dev](https://transitions.dev)（免費授權，見其 LICENSE）。中英對照的中文名來自 [Vesper0802/Nivalis_console](https://github.com/Vesper0802/Nivalis_console) 的遊戲簡中顯示名（轉繁體，待確認）；壽命資料來自 [HiveSolution/nivalis-save-editor](https://github.com/HiveSolution/nivalis-save-editor)。

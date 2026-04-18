# MD Meta Weekly

Yu-Gi-Oh! Master Duel 環境メタを可視化するダッシュボード。毎週金曜 21:00 JST に
[Master Duel Meta](https://www.masterduelmeta.com/) の公式APIから最新データを
自動取得して更新される。

## 構成

```
├── index.html          # エントリポイント
├── style.css           # Vercel/Linear 風ダークテーマ
├── app.js              # data.json を fetch してレンダリング
├── data.json           # デッキ・Tier・使用率・マッチアップ（自動更新対象）
├── scripts/
│   ├── update-meta.mjs     # 週次更新スクリプト
│   └── deck-name-map.json  # MDM英語名 ↔ data.json ID 対応表
└── .github/workflows/
    └── weekly-update.yml   # GitHub Actions: 毎週金曜21時JST実行
```

## ローカルで試す

```bash
# プレビュー
python3 -m http.server 5050
# http://localhost:5050/

# 差分プレビュー（書き込まず表示のみ）
npm run update:dry

# 実書き込み
npm run update
```

## データソース

- [Master Duel Meta API](https://www.masterduelmeta.com/) — Tier / 使用率 / 勝率 / 禁止制限
  - `/api/v1/deck-types?masterPopRank[$gt]=0` — Master 1 ランク帯の使用率
  - `/api/v1/deck-types?tournamentPower[$gte]=1` — トーナメント Power
  - `/api/v1/banlist-changes` — 禁止制限履歴
- [AppMedia Tier 表](https://appmedia.jp/master_duel/27456846)（参考）
- [Game8 Master Duel Tier List](https://game8.co/games/Yu-Gi-Oh-Master-Duel/)（参考）

## 新デッキを追加する

1. MDMで新デッキが Tier 入りしたら `scripts/deck-name-map.json` に英語名 → 新しい deck id を登録
2. `data.json` の `decks` 配列に日本語名・キーカード・短縮ラベルなど詳細を追加
3. `data.json` の `matchup` マトリクスに 1 行／1 列追加
4. 次回の週次更新で自動的に数値が入る

## 自動更新されないもの

- **マッチアップ表** — 公式統計がないためコミュニティ情報ベース（手動更新）
- **デッキ詳細** — キーカード／強み／弱み／コンボ（手動更新）

## Tier 判定ロジック

MDMの `tournamentPower` を閾値で Tier に変換：

| Tier | tournamentPower |
| ---- | --------------- |
| S+   | ≥ 15            |
| S    | ≥ 8             |
| A    | ≥ 4             |
| B    | ≥ 2             |
| C    | ≥ 1             |

---
title: 'GitHub: Pull Request'
description: Pull Request がマージされるまでに GitHub の内部で何が起きているのか（ref・マージ戦略・required checks・branch protection）を技術的に解説します。
---

Pull Request（PR）は「ブランチ間の差分をレビューしてから統合する」ための仕組みです。
ここでは UI 操作ではなく、**GitHub の内部で何が起きているか** を中心に解説します。

## PR はブランチではなく「2 つの ref の差分」

PR は 1 本のブランチそのものではなく、**base ref** と **head ref** という 2 つの参照（ref）の関係として表現されます。

- **head**: 変更を持ち込む側。フォーク PR では `refs/pull/:number/head` として GitHub 側にも複製されます。
- **base**: 取り込み先（多くの場合 `main`）。
- GitHub は PR ごとに `refs/pull/:number/merge` という**テスト用マージ ref** を内部生成し、「いま base に取り込んだらどうなるか」を先読みできるようにしています。

差分（diff）は head と base の **マージベース**（共通祖先コミット）を起点とした three-way 比較で計算されます。
そのため base が進んでも、PR の diff は「共通祖先からの変更」だけを示し、無関係な変更で膨らみません。

## マージ戦略の違いは「履歴の形」の違い

GitHub の 3 つのマージ方法は、生成されるコミットグラフが異なります。

| 方法 | 内部で起きること | 履歴の形 |
| --- | --- | --- |
| Merge commit | 親を 2 つ持つマージコミットを作成 | 分岐と合流が残る |
| Squash and merge | head の全コミットを 1 つに圧縮して base に載せる | 直線的、PR = 1 コミット |
| Rebase and merge | head の各コミットを base の先端に付け替える | 直線的、コミット単位を保持 |

Squash / Rebase では **コミットハッシュが作り直される**点が重要です。元の head コミットは PR には残りますが、base には別ハッシュで載ります。

## マージ可能性の判定

「Merge できるか」は主に次で決まります。

1. **コンフリクトの有無** — テスト用マージ ref を作れるか（three-way マージが自動解決できるか）。
2. **required status checks** — 必須チェックが head の最新 SHA に対して成功しているか。
3. **required reviews** — 必要な承認が揃い、Changes requested が解決済みか。
4. **branch protection / rulesets** — 上記を強制するルール。

これらは head の **現在の SHA** に束縛されます。新しいコミットを push すると SHA が変わり、チェックは再評価されます。

## branch protection と required checks

`main` などの保護ブランチでは、次のようなルールを強制できます。

- 特定のステータスチェックの成功を必須にする（*required status checks*）。
- レビュー承認数、CODEOWNERS レビューを必須にする。
- 直接 push を禁止し、変更を必ず PR 経由にする。
- チェックが head SHA に対して最新であることを要求する（*require branches to be up to date*）。

これにより「レビューと自動検証を通過した変更だけが base に入る」ことが保証されます。

## このリポジトリでの実例

Shiki Atlas 自身も、すべての変更が PR 経由で `main` に入ります。この PR では次の required checks が head SHA に対して評価されます。

- **Validate Shiki mirror** — `.shiki` 制御面の整合性検証
- **CCA verdict** — 完了判定エージェントによる構造化判定
- **MergeGate metadata check** / **MergeGate policy check** — マージ可否の決定的ゲート

実際の証跡は次で確認できます。

- Pull Requests: <https://github.com/mizutani-140/shiki-atlas/pulls>
- Actions（チェック実行ログ）: <https://github.com/mizutani-140/shiki-atlas/actions>

:::note
GitHub の全機能を網羅することは本サイトの目的ではありません。主要機能を 1 つずつ、内部動作の観点で解説していきます。
:::

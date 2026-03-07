# Durable Webhook Intake and Queue Handoff

## TL;DR

> **Quick Summary**: GitHub webhook を受信し、署名検証・イベント正規化・配信記録永続化・冪等性チェック・ジョブキュー投入まで の最初の durable vertical slice を実装する。
> 
> **Deliverables**:
> - POST /webhook ルート（署名検証付き）
> - 3種のPRレビューイベント正規化（issue_comment, pull_request_review, pull_request_review_comment）
> - Delivery + Idempotency 永続化レイヤー（Drizzle schema + in-memory adapter）
> - 冪等性チェック（X-GitHub-Delivery ベース）
> - ingest flow の拡張（delivery 記録 + 冪等性 + queue enqueue）
> - TDD による unit/integration テスト
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 7 → Task 9 → Task 11 → Task 12

---

## Context

### Original Request
Issue #1: "Implement durable webhook intake and queue handoff" — Phase 1 (webhook intake + normalization) と Phase 2 (durable delivery + run persistence) を合わせた最初の vertical slice。

### Interview Summary
**Key Discussions**:
- **冪等性キー設計**: `X-GitHub-Delivery` ヘッダーを使用。GitHub が保証するユニーク ID で、再配信でも同じ ID が使われる。
- **テスト戦略**: TDD (RED-GREEN-REFACTOR)。各タスクはテストを先に書く。
- **ActionabilitySignal**: application 層で default stub signal を付与。全イベント → "suggest"。Phase 4 で本格的なポリシー評価に置換。Oracle が妥当性を検証済み。

**Research Findings**:
- 既存スキャフォールドは健全: domain types, interfaces, in-memory adapters, health endpoint, 2テスト通過中
- `issue_comment` webhook payload には PR head SHA が含まれない → `headSha` を `string | null` にする必要あり
- Fastify は HMAC 検証のため raw body アクセスが必要 → `addContentTypeParser` で対応
- 既存の `ingestReviewEvent` use case に delivery persistence と idempotency を追加する必要あり

### Metis Review
**Identified Gaps** (addressed):
- `issue_comment` に headSha がない → `headSha: string | null` に変更、worker が後で解決
- HTTP レスポンス契約が未定義 → 標準的な webhook パターンを適用（200/401/400）
- `buildServer` の DI 方式が未定 → deps パラメータ方式を採用（テスト容易性維持）

---

## Work Objectives

### Core Objective
GitHub App webhook を受信し、署名検証・イベント正規化・配信記録永続化・冪等性ハンドリング・ジョブキュー投入までの最初の durable vertical slice を TDD で実装する。

### Concrete Deliverables
- `src/entrypoints/http/` — webhook ルートハンドラ + raw body parser
- `src/domain/review-events/` — イベント正規化ロジック + 型拡張
- `src/domain/deliveries/` — delivery record 型定義
- `src/application/use-cases/` — ingest flow の拡張（delivery + idempotency）
- `src/adapters/persistence/` — DeliveryRepository interface + in-memory impl + Drizzle schema 拡張
- `src/config/env.ts` — WEBHOOK_SECRET 追加
- `test/unit/` — domain / use-case ユニットテスト
- `test/integration/` — webhook ルート統合テスト
- `test/fixtures/` — 3 種の GitHub webhook ペイロードフィクスチャ

### Definition of Done
- [x] `pnpm lint` passes
- [x] `pnpm test` passes — 全テスト GREEN
- [x] webhook エンドポイントが有効な署名付きペイロードを受理し、無効な署名を拒否する
- [x] 3種のイベントが内部 `ReviewFeedbackEvent` に正規化される
- [x] 未サポートのイベント/アクションが明示的に拒否（200 + ignored）される
- [x] 受理された webhook が durable delivery レコードを作成する
- [x] 受理された webhook が durable run レコードを作成する
- [x] 重複/再配信が idempotency key で安全に処理される
- [x] アクション可能な run が正確に1回 enqueue される

### Must Have
- `X-GitHub-Delivery` ベースの冪等性チェック
- `@octokit/webhooks` による署名検証
- 3種のイベント正規化（issue_comment, pull_request_review, pull_request_review_comment）
- in-memory adapter でのユニットテスト（Postgres 不要）
- TDD: テストファースト

### Must NOT Have (Guardrails)
- pg-boss worker のポーリングループや queue consumption
- GitHub への write-back（コメント投稿等）
- worktree クローンやファイル操作
- 修正の適用（rule-based / agent-based）
- PR ブランチへの push-back
- `issue_comment` body からの heuristic な ActionabilitySignal 推定（policy は Phase 4）
- `any`, `@ts-ignore`, `@ts-expect-error` の使用
- domain 層への Fastify / Octokit / DB クライアントの直接依存

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: Vitest
- **Each task follows**: RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Use Bash (node/vitest) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + types + fixtures):
├── Task 1: ReviewFeedbackEvent headSha optional 化 + delivery type 定義 [quick]
├── Task 2: WEBHOOK_SECRET 環境変数追加 [quick]
├── Task 3: GitHub webhook ペイロードフィクスチャ作成 [quick]
├── Task 4: イベント正規化モジュール（TDD）[deep]
├── Task 5: DeliveryRepository interface + in-memory impl [quick]
└── Task 6: Drizzle schema 拡張（deliveries + idempotency_keys テーブル）[quick]

Wave 2 (After Wave 1 — core flow):
├── Task 7: 署名検証モジュール（TDD）[deep]
├── Task 8: defaultActionabilitySignal ヘルパー [quick]
└── Task 9: ingestReviewEvent 拡張 — delivery 永続化 + 冪等性チェック（TDD）[deep]

Wave 3 (After Wave 2 — HTTP wiring + integration):
├── Task 10: buildServer DI + raw body parser [quick]
├── Task 11: POST /webhook ルートハンドラ（TDD）[deep]
└── Task 12: 統合テスト — 全パス検証 [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 7 → Task 9 → Task 11 → Task 12
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 4, 5, 9 |
| 2 | — | 7, 10 |
| 3 | — | 4, 11, 12 |
| 4 | 1, 3 | 9, 11 |
| 5 | 1 | 9 |
| 6 | 1 | — |
| 7 | 2 | 11 |
| 8 | — | 9 |
| 9 | 1, 4, 5, 8 | 11 |
| 10 | 2 | 11 |
| 11 | 4, 7, 9, 10 | 12 |
| 12 | 11, 3 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: **6** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `deep`, T5 → `quick`, T6 → `quick`
- **Wave 2**: **3** — T7 → `deep`, T8 → `quick`, T9 → `deep`
- **Wave 3**: **3** — T10 → `quick`, T11 → `deep`, T12 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> TDD: 各タスクは RED (failing test) → GREEN (minimal impl) → REFACTOR の順で実行。

- [x] 1. ReviewFeedbackEvent headSha optional 化 + WebhookDelivery 型定義

  **What to do**:
  - `src/domain/review-events/review-feedback-event.ts` の `headSha` を `string` → `string | null` に変更
  - `src/domain/deliveries/webhook-delivery.ts` を新規作成: `WebhookDelivery` interface を定義
    - fields: `id` (string, X-GitHub-Delivery), `eventType` (string), `action` (string), `receivedAt` (string), `processed` (boolean)
  - RED: `test/unit/domain/review-feedback-event.test.ts` で `headSha: null` を含むイベント生成テスト
  - GREEN: 型を変更して通す
  - 既存テスト (`ingest-review-event.test.ts`) の `headSha` はそのまま string 値でOK（`string | null` は上位互換）

  **Must NOT do**:
  - domain 外のモジュールに依存を追加しない
  - `headSha` を完全に削除しない（pull_request_review/pull_request_review_comment には存在する）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 型の変更と小さな新ファイル1つ。実装量が少ない。
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: UI なし

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 4, 5, 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/domain/review-events/review-feedback-event.ts:14-22` — 現在の `ReviewFeedbackEvent` interface（headSha は L17 で `string`）
  - `src/domain/runs/review-run.ts:8-14` — `ReviewRun` interface（`event: ReviewFeedbackEvent` を持つ）

  **API/Type References**:
  - `src/contracts/review-job-payload.ts:1-7` — `ReviewJobPayload` にも `headSha` がある（こちらは `string` のまま — worker が解決後に設定するため）

  **Test References**:
  - `test/unit/application/ingest-review-event.test.ts:19-30` — 既存テストの event fixture（headSha: "abc123"）

  **WHY Each Reference Matters**:
  - `review-feedback-event.ts` は変更対象そのもの
  - `review-run.ts` は ReviewFeedbackEvent を使用するので型変更の影響確認
  - `review-job-payload.ts` は headSha を持つが worker 側の契約なので変更不要と確認
  - 既存テストは `string` 値を渡しているので壊れないことを確認

  **Acceptance Criteria**:
  - [ ] `headSha: null` を持つ `ReviewFeedbackEvent` が型チェックを通る
  - [ ] `headSha: "abc123"` を持つ既存パターンも引き続き通る
  - [ ] `WebhookDelivery` interface が export される
  - [ ] `pnpm typecheck` passes
  - [ ] テストが GREEN

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: headSha null の ReviewFeedbackEvent が型チェックを通る
    Tool: Bash (pnpm typecheck)
    Preconditions: headSha を string | null に変更済み
    Steps:
      1. pnpm typecheck を実行
      2. exit code 0 を確認
    Expected Result: 型チェック通過、エラーなし
    Failure Indicators: tsc が headSha 関連のエラーを報告
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: 既存テストが壊れない
    Tool: Bash (pnpm test)
    Preconditions: headSha 型変更済み
    Steps:
      1. pnpm test を実行
      2. 既存の ingest-review-event.test.ts が PASS であることを確認
    Expected Result: 全テスト PASS
    Failure Indicators: 既存テストが FAIL
    Evidence: .sisyphus/evidence/task-1-existing-tests.txt
  ```

  **Commit**: YES
  - Message: `refactor(domain): make headSha optional and add WebhookDelivery type`
  - Files: `src/domain/review-events/review-feedback-event.ts`, `src/domain/deliveries/webhook-delivery.ts`, `test/unit/domain/review-feedback-event.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 2. WEBHOOK_SECRET 環境変数追加

  **What to do**:
  - `src/config/env.ts` の `runtimeConfigSchema` に `WEBHOOK_SECRET` フィールドを追加
    - `z.string().min(1)` — デフォルト値なし（必須）
  - `RuntimeConfig` interface に `webhookSecret: string` を追加
  - `loadRuntimeConfig` の return に追加
  - RED: `test/unit/config/env.test.ts` で WEBHOOK_SECRET 欠如時のエラーと、設定時の正常読み込みをテスト
  - GREEN: 実装

  **Must NOT do**:
  - デフォルト値を設定しない（secret は必須）
  - WEBHOOK_SECRET をログに出力しない

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 1ファイルの追加フィールドのみ
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/config/env.ts:5-13` — 既存の Zod schema パターン（DATABASE_URL, HOST, PORT, RUN_MODE）
  - `src/config/env.ts:15-20` — RuntimeConfig interface の既存フィールド

  **Test References**:
  - `test/integration/entrypoints/http/build-server.test.ts:18-24` — 既存テストで env を渡すパターン

  **WHY Each Reference Matters**:
  - `env.ts` は変更対象そのもの — 既存の Zod パターンに合わせて追加
  - `build-server.test.ts` は env を渡しているので WEBHOOK_SECRET 追加後に壊れないか確認

  **Acceptance Criteria**:
  - [ ] WEBHOOK_SECRET なしで `loadRuntimeConfig` が Zod エラーを throw する
  - [ ] WEBHOOK_SECRET ありで `loadRuntimeConfig` が `webhookSecret` を含む config を返す
  - [ ] 既存テストが WEBHOOK_SECRET 追加を反映して通る
  - [ ] `pnpm typecheck` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: WEBHOOK_SECRET 欠如で Zod バリデーションエラー
    Tool: Bash (pnpm test)
    Preconditions: テスト内で WEBHOOK_SECRET を省略した env を loadRuntimeConfig に渡す
    Steps:
      1. テスト実行: loadRuntimeConfig({...基本env}) で WEBHOOK_SECRET なし
      2. ZodError が throw されることを expect
    Expected Result: ZodError が throw される
    Failure Indicators: エラーなしで config が返る
    Evidence: .sisyphus/evidence/task-2-missing-secret.txt

  Scenario: WEBHOOK_SECRET 設定時に正常読み込み
    Tool: Bash (pnpm test)
    Preconditions: テスト内で WEBHOOK_SECRET を含む env を loadRuntimeConfig に渡す
    Steps:
      1. loadRuntimeConfig({...基本env, WEBHOOK_SECRET: "test-secret"}) を呼ぶ
      2. result.webhookSecret === "test-secret" を assert
    Expected Result: webhookSecret フィールドが正しく返る
    Failure Indicators: webhookSecret が undefined またはない
    Evidence: .sisyphus/evidence/task-2-valid-secret.txt
  ```

  **Commit**: YES
  - Message: `feat(config): add WEBHOOK_SECRET environment variable`
  - Files: `src/config/env.ts`, `test/unit/config/env.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 3. GitHub webhook ペイロードフィクスチャ作成

  **What to do**:
  - `test/fixtures/webhooks/` ディレクトリを作成
  - 3種のイベントのフィクスチャ TypeScript ファイルを作成:
    - `test/fixtures/webhooks/issue-comment.ts` — PR上の issue_comment (created action)
    - `test/fixtures/webhooks/pull-request-review.ts` — pull_request_review (submitted action)
    - `test/fixtures/webhooks/pull-request-review-comment.ts` — pull_request_review_comment (created action)
  - 各フィクスチャは GitHub webhook の実際のペイロード構造に準拠（最小限の必要フィールド）
  - 加えて、`test/fixtures/webhooks/index.ts` でバレルエクスポート
  - RED: `test/unit/fixtures/webhook-fixtures.test.ts` でフィクスチャが期待される構造を持つことを検証
  - GREEN: フィクスチャ実装

  **Must NOT do**:
  - 実際の GitHub API を呼ばない
  - 不必要に巨大なペイロードにしない（正規化に必要なフィールドのみ）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: データ定義のみ。ロジックなし。
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 4, 11, 12
  - **Blocked By**: None

  **References**:

  **External References**:
  - GitHub Webhooks docs: `https://docs.github.com/en/webhooks/webhook-events-and-payloads#issue_comment`
  - GitHub Webhooks docs: `https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request_review`
  - GitHub Webhooks docs: `https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request_review_comment`

  **API/Type References**:
  - `src/domain/review-events/review-feedback-event.ts:14-22` — 正規化後の型。フィクスチャはこの型に変換可能なフィールドを含む必要がある

  **WHY Each Reference Matters**:
  - GitHub docs は実際のペイロード構造の正確な参照元
  - `ReviewFeedbackEvent` は正規化のターゲット型 — フィクスチャに必要なフィールドの把握に必要

  **Acceptance Criteria**:
  - [ ] 3種のフィクスチャファイルが存在する
  - [ ] 各フィクスチャが GitHub の実ペイロード構造に準拠
  - [ ] `issue_comment` フィクスチャが PR 上のコメント（`issue.pull_request` 存在）
  - [ ] 各フィクスチャに `action`, `sender.login`, `repository.owner.login`, `repository.name` がある
  - [ ] `pull_request_review` と `pull_request_review_comment` に `pull_request.head.sha` がある
  - [ ] `pnpm typecheck` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: フィクスチャが必要なフィールドを持つ
    Tool: Bash (pnpm test)
    Preconditions: フィクスチャファイル作成済み
    Steps:
      1. テストで各フィクスチャをインポート
      2. 必要フィールド (action, sender.login, repository.owner.login, repository.name) の存在を assert
      3. pull_request_review/pull_request_review_comment で pull_request.head.sha の存在を assert
    Expected Result: 全フィクスチャが期待される構造を持つ
    Failure Indicators: フィールドが undefined
    Evidence: .sisyphus/evidence/task-3-fixture-structure.txt

  Scenario: issue_comment フィクスチャが PR 上のコメント
    Tool: Bash (pnpm test)
    Preconditions: issue-comment フィクスチャ作成済み
    Steps:
      1. issue_comment フィクスチャの issue.pull_request が truthy であることを assert
    Expected Result: pull_request プロパティが存在
    Failure Indicators: issue.pull_request が undefined
    Evidence: .sisyphus/evidence/task-3-issue-comment-pr.txt
  ```

  **Commit**: YES
  - Message: `test(fixtures): add GitHub webhook payload fixtures for 3 event types`
  - Files: `test/fixtures/webhooks/*.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 4. イベント正規化モジュール（TDD）

  **What to do**:
  - `src/domain/review-events/normalize-webhook-event.ts` を新規作成
  - 関数: `normalizeWebhookEvent(eventType: string, action: string, payload: unknown): ReviewFeedbackEvent | null`
    - `issue_comment` (action: "created") → `ReviewFeedbackEvent` (headSha: null)
    - `pull_request_review` (action: "submitted") → `ReviewFeedbackEvent` (headSha: payload から取得)
    - `pull_request_review_comment` (action: "created") → `ReviewFeedbackEvent` (headSha: payload から取得)
    - 未サポートの eventType/action → `null` を返す
    - `issue_comment` で `issue.pull_request` がない場合 → `null`（PR 上でないコメント）
  - Zod で最小限のペイロードバリデーション（必要フィールドの抽出のみ）
  - RED: `test/unit/domain/normalize-webhook-event.test.ts` でフィクスチャを使って全パスをテスト
  - GREEN: 実装
  - REFACTOR: 共通抽出ロジックの整理

  **Must NOT do**:
  - GitHub API 呼び出し
  - ActionabilitySignal の計算
  - body テキストの解析（正規化は構造的なフィールドマッピングのみ）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 3種のイベント正規化 + Zod バリデーション + エッジケース。domain ロジックの中核。
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Task 1, 3 完了後）
  - **Parallel Group**: Wave 1（ただし Task 1, 3 に依存）
  - **Blocks**: Tasks 9, 11
  - **Blocked By**: Tasks 1 (headSha optional), 3 (fixtures)

  **References**:

  **Pattern References**:
  - `src/domain/review-events/review-feedback-event.ts:1-22` — 正規化ターゲット型 + REVIEW_EVENT_KINDS 定数
  - `src/domain/policy/actionability.ts:11-34` — pure domain function のパターン参考

  **API/Type References**:
  - `src/domain/review-events/review-feedback-event.ts:9-12` — RepositoryRef 型（repository 情報の格納先）

  **Test References**:
  - `test/unit/application/ingest-review-event.test.ts:19-30` — event fixture の使い方パターン

  **External References**:
  - GitHub Webhooks docs: `https://docs.github.com/en/webhooks/webhook-events-and-payloads`
  - Zod docs: `https://zod.dev/?id=basic-usage` — payload バリデーション

  **WHY Each Reference Matters**:
  - `review-feedback-event.ts` は出力型。正規化結果をこの型に合わせる
  - `actionability.ts` は pure domain function のスタイル参考（引数 → 結果、副作用なし）
  - GitHub docs は入力ペイロードの正確な構造参照
  - Zod は payload 抽出/バリデーション用

  **Acceptance Criteria**:
  - [ ] `issue_comment` (created, PR上) → `ReviewFeedbackEvent` (headSha: null)
  - [ ] `pull_request_review` (submitted) → `ReviewFeedbackEvent` (headSha: string)
  - [ ] `pull_request_review_comment` (created) → `ReviewFeedbackEvent` (headSha: string)
  - [ ] 未サポート eventType → `null`
  - [ ] 未サポート action → `null`
  - [ ] issue_comment で `issue.pull_request` なし → `null`
  - [ ] 不正なペイロード構造 → `null`（throw しない）
  - [ ] `pnpm test` — 全テスト PASS

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: pull_request_review (submitted) の正規化
    Tool: Bash (pnpm test)
    Preconditions: normalizeWebhookEvent 実装済み、pull-request-review フィクスチャあり
    Steps:
      1. normalizeWebhookEvent("pull_request_review", "submitted", fixture) を呼ぶ
      2. result !== null を assert
      3. result.kind === "pull_request_review" を assert
      4. result.headSha が string であることを assert
      5. result.actorLogin === fixture.sender.login を assert
    Expected Result: 正規化された ReviewFeedbackEvent が返る
    Failure Indicators: null が返る、または型が合わない
    Evidence: .sisyphus/evidence/task-4-pr-review-normalize.txt

  Scenario: 未サポートイベントの拒否
    Tool: Bash (pnpm test)
    Preconditions: normalizeWebhookEvent 実装済み
    Steps:
      1. normalizeWebhookEvent("push", "completed", {}) を呼ぶ
      2. result === null を assert
    Expected Result: null が返る
    Failure Indicators: non-null が返る、または throw する
    Evidence: .sisyphus/evidence/task-4-unsupported-event.txt

  Scenario: issue_comment が PR 上でない場合の拒否
    Tool: Bash (pnpm test)
    Preconditions: normalizeWebhookEvent 実装済み
    Steps:
      1. issue_comment フィクスチャから issue.pull_request を削除したペイロードを作成
      2. normalizeWebhookEvent("issue_comment", "created", modifiedPayload) を呼ぶ
      3. result === null を assert
    Expected Result: null が返る（PR 上でないコメントは無視）
    Failure Indicators: non-null が返る
    Evidence: .sisyphus/evidence/task-4-non-pr-comment.txt
  ```

  **Commit**: YES
  - Message: `feat(domain): add webhook event normalization for 3 PR review event types`
  - Files: `src/domain/review-events/normalize-webhook-event.ts`, `test/unit/domain/normalize-webhook-event.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 5. DeliveryRepository interface + in-memory impl

  **What to do**:
  - `src/adapters/persistence/delivery-repository.ts` を新規作成: `DeliveryRepository` interface
    - `save(delivery: WebhookDelivery): Promise<void>`
    - `findById(id: string): Promise<WebhookDelivery | null>`
    - `existsById(id: string): Promise<boolean>` — 冪等性チェック用
  - `src/adapters/persistence/in-memory-delivery-repository.ts` を新規作成: in-memory 実装
  - RED: `test/unit/adapters/in-memory-delivery-repository.test.ts` で save/findById/existsById をテスト
  - GREEN: 実装

  **Must NOT do**:
  - Postgres/Drizzle の実装は入れない（Phase 1-2 は in-memory のみ）
  - business logic を adapter に入れない

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: interface 1つ + in-memory 実装1つ。既存パターン (ReviewRunRepository) のコピー。
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Task 1 完了後）
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 9
  - **Blocked By**: Task 1 (WebhookDelivery 型)

  **References**:

  **Pattern References**:
  - `src/adapters/persistence/review-run-repository.ts:1-6` — 既存の Repository interface パターン（findById, save）
  - `src/adapters/persistence/in-memory-review-run-repository.ts:1-15` — 既存の in-memory 実装パターン（Map ベース）

  **API/Type References**:
  - `src/domain/deliveries/webhook-delivery.ts` — Task 1 で作成する WebhookDelivery 型（import 先）

  **WHY Each Reference Matters**:
  - `review-run-repository.ts` は同じパターンのインターフェース — メソッドシグネチャのスタイルを合わせる
  - `in-memory-review-run-repository.ts` は Map ベース実装のテンプレート — 同じスタイルで実装

  **Acceptance Criteria**:
  - [ ] `DeliveryRepository` interface が export される
  - [ ] `InMemoryDeliveryRepository` が interface を implement する
  - [ ] `save` → `findById` で保存した delivery を取得できる
  - [ ] `existsById` が存在するIDでtrue、存在しないIDでfalseを返す
  - [ ] `pnpm typecheck` passes
  - [ ] テスト GREEN

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: delivery の保存と取得
    Tool: Bash (pnpm test)
    Preconditions: InMemoryDeliveryRepository 実装済み
    Steps:
      1. repo.save(delivery) を呼ぶ
      2. repo.findById(delivery.id) を呼ぶ
      3. 返り値が delivery と同じことを assert
    Expected Result: 保存した delivery が取得できる
    Failure Indicators: null が返る
    Evidence: .sisyphus/evidence/task-5-save-find.txt

  Scenario: existsById で存在チェック
    Tool: Bash (pnpm test)
    Preconditions: InMemoryDeliveryRepository 実装済み
    Steps:
      1. repo.existsById("nonexistent") → false を assert
      2. repo.save(delivery) を呼ぶ
      3. repo.existsById(delivery.id) → true を assert
    Expected Result: 存在しないIDでfalse、存在するIDでtrue
    Failure Indicators: 逆の値が返る
    Evidence: .sisyphus/evidence/task-5-exists-check.txt
  ```

  **Commit**: YES
  - Message: `feat(adapters): add DeliveryRepository interface and in-memory implementation`
  - Files: `src/adapters/persistence/delivery-repository.ts`, `src/adapters/persistence/in-memory-delivery-repository.ts`, `test/unit/adapters/in-memory-delivery-repository.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 6. Drizzle schema 拡張（deliveries + idempotency_keys テーブル）

  **What to do**:
  - `src/adapters/persistence/schema.ts` に以下を追加:
    - `webhookDeliveriesTable` — webhook 配信記録テーブル
      - `id` (text, PK — X-GitHub-Delivery UUID)
      - `event_type` (text, not null)
      - `action` (text, not null)
      - `received_at` (timestamp with timezone, not null)
      - `processed` (boolean, not null, default false)
    - `idempotencyKeysTable` — 冪等性キーテーブル
      - `key` (text, PK — X-GitHub-Delivery)
      - `run_id` (text, not null, FK → review_runs.id)
      - `created_at` (timestamp with timezone, not null)
  - RED: テストなし（schema 定義のみ、Drizzle migration は統合テストの範囲）
  - ただし `pnpm typecheck` で型チェック

  **Must NOT do**:
  - migration ファイルの生成（Drizzle Kit は DB 接続が必要）
  - 実際の DB 操作テスト

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 既存 schema ファイルへの追加のみ
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None (schema 定義は他タスクをブロックしない — in-memory adapter が先に使われる)
  - **Blocked By**: Task 1 (WebhookDelivery 型の確認のため)

  **References**:

  **Pattern References**:
  - `src/adapters/persistence/schema.ts:1-23` — 既存の Drizzle schema（pgEnum, pgTable, text, timestamp のインポートと使い方）

  **External References**:
  - Drizzle ORM docs: `https://orm.drizzle.team/docs/sql-schema-declaration` — pgTable 定義

  **WHY Each Reference Matters**:
  - `schema.ts` は変更対象そのもの — 既存のインポートと pgTable パターンに合わせる

  **Acceptance Criteria**:
  - [ ] `webhookDeliveriesTable` が schema.ts に定義される
  - [ ] `idempotencyKeysTable` が schema.ts に定義される
  - [ ] `pnpm typecheck` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: schema 定義が型チェックを通る
    Tool: Bash (pnpm typecheck)
    Preconditions: schema.ts にテーブル追加済み
    Steps:
      1. pnpm typecheck を実行
      2. exit code 0 を確認
    Expected Result: 型チェック通過
    Failure Indicators: Drizzle 関連の型エラー
    Evidence: .sisyphus/evidence/task-6-typecheck.txt

  Scenario: テーブル定義が export されている
    Tool: Bash (pnpm test を含む typecheck)
    Preconditions: schema.ts にテーブル追加済み
    Steps:
      1. schema.ts から webhookDeliveriesTable と idempotencyKeysTable がインポート可能であることを確認（typecheck で間接検証）
    Expected Result: export が存在し、型チェック通過
    Failure Indicators: import エラー
    Evidence: .sisyphus/evidence/task-6-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add webhook_deliveries and idempotency_keys tables`
  - Files: `src/adapters/persistence/schema.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 7. 署名検証モジュール（TDD）

  **What to do**:
  - `src/entrypoints/http/verify-webhook-signature.ts` を新規作成
  - 関数: `verifyWebhookSignature(secret: string, payload: string | Buffer, signature: string): Promise<boolean>`
    - `@octokit/webhooks` の `verify()` を使用
  - RED: `test/unit/entrypoints/http/verify-webhook-signature.test.ts`
    - 有効な署名で true を返す
    - 無効な署名で false を返す
    - signature が空文字列で false を返す
  - GREEN: `@octokit/webhooks` の verify を呼び出す実装
  - テストでは実際の HMAC 署名を計算して検証（`@octokit/webhooks` の `sign()` を使用）

  **Must NOT do**:
  - 独自の HMAC 実装（@octokit/webhooks に委譲）
  - Fastify への結合（pure function として実装）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: @octokit/webhooks の API 理解 + HMAC 署名のテスト生成が必要
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Task 2 完了後）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 11
  - **Blocked By**: Task 2 (WEBHOOK_SECRET config)

  **References**:

  **External References**:
  - `@octokit/webhooks` npm docs: verify 関数の API
  - GitHub Webhooks docs: `https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries`

  **Pattern References**:
  - `src/entrypoints/http/build-server.ts:1-20` — entrypoints/http 内のファイル配置パターン

  **WHY Each Reference Matters**:
  - `@octokit/webhooks` は署名検証の実装先 — verify() API を使う
  - GitHub docs は検証の仕組み（HMAC-SHA256）の参照
  - `build-server.ts` は同ディレクトリの既存ファイル — 命名/構造を合わせる

  **Acceptance Criteria**:
  - [ ] 有効な HMAC 署名で `true` を返す
  - [ ] 無効な署名で `false` を返す
  - [ ] 空文字列 signature で `false` を返す
  - [ ] `@octokit/webhooks` の verify を内部で使用
  - [ ] `pnpm test` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 有効な署名での検証成功
    Tool: Bash (pnpm test)
    Preconditions: verifyWebhookSignature 実装済み
    Steps:
      1. @octokit/webhooks の sign() で payload の署名を生成
      2. verifyWebhookSignature(secret, payload, signature) を呼ぶ
      3. result === true を assert
    Expected Result: true が返る
    Failure Indicators: false が返る
    Evidence: .sisyphus/evidence/task-7-valid-signature.txt

  Scenario: 無効な署名での検証失敗
    Tool: Bash (pnpm test)
    Preconditions: verifyWebhookSignature 実装済み
    Steps:
      1. verifyWebhookSignature(secret, payload, "sha256=invalid") を呼ぶ
      2. result === false を assert
    Expected Result: false が返る
    Failure Indicators: true が返る、または throw する
    Evidence: .sisyphus/evidence/task-7-invalid-signature.txt
  ```

  **Commit**: YES
  - Message: `feat(http): add webhook signature verification using @octokit/webhooks`
  - Files: `src/entrypoints/http/verify-webhook-signature.ts`, `test/unit/entrypoints/http/verify-webhook-signature.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 8. defaultActionabilitySignal ヘルパー

  **What to do**:
  - `src/application/signals/default-actionability-signal.ts` を新規作成
  - 関数: `createDefaultActionabilitySignal(): ActionabilitySignal`
    - return `{ hasConcreteTarget: true, hasBoundedChange: true, requiresHiddenContext: false, requiresUnsafeSideEffects: false, trustedExecution: false }`
    - これにより `classifyActionability` は常に `"suggest"` を返す
  - RED: `test/unit/application/default-actionability-signal.test.ts`
    - `createDefaultActionabilitySignal()` の戻り値を `classifyActionability` に渡すと `"suggest"` になることをテスト
  - GREEN: 実装

  **Must NOT do**:
  - body テキストの解析
  - heuristic な判定ロジック
  - ActionabilitySignal のフィールド追加

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 定数を返すヘルパー関数1つ + テスト1つ
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（Wave 1 と同時でも可、依存なし）
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/domain/policy/actionability.ts:3-9` — ActionabilitySignal 型定義
  - `src/domain/policy/actionability.ts:11-34` — classifyActionability 関数（stub の戻り値が "suggest" になることを確認）

  **Test References**:
  - `test/unit/application/ingest-review-event.test.ts:32-38` — 既存テストでの signal 構築パターン

  **WHY Each Reference Matters**:
  - `actionability.ts:3-9` は戻り値の型定義 — フィールドを全て埋める必要がある
  - `actionability.ts:11-34` は stub signal → "suggest" になるロジックの確認
  - 既存テストは signal の使われ方の参考

  **Acceptance Criteria**:
  - [ ] `createDefaultActionabilitySignal()` が `ActionabilitySignal` を返す
  - [ ] `classifyActionability(createDefaultActionabilitySignal())` === `"suggest"`
  - [ ] `pnpm test` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: default signal で suggest に分類される
    Tool: Bash (pnpm test)
    Preconditions: createDefaultActionabilitySignal 実装済み
    Steps:
      1. const signal = createDefaultActionabilitySignal()
      2. const result = classifyActionability(signal)
      3. result === "suggest" を assert
    Expected Result: "suggest" が返る
    Failure Indicators: "ignore" や "apply" が返る
    Evidence: .sisyphus/evidence/task-8-default-signal.txt
  ```

  **Commit**: YES
  - Message: `feat(application): add default actionability signal helper for Phase 1-2`
  - Files: `src/application/signals/default-actionability-signal.ts`, `test/unit/application/default-actionability-signal.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 9. ingestReviewEvent 拡張 — delivery 永続化 + 冪等性チェック（TDD）

  **What to do**:
  - `src/application/use-cases/ingest-review-event.ts` を拡張:
    - `IngestReviewEventDependencies` に `deliveryRepository: DeliveryRepository` を追加
    - `IngestReviewEventInput` に `deliveryId: string` を追加
    - フロー:
      1. `deliveryRepository.existsById(deliveryId)` で冪等性チェック
      2. 重複なら `{ actionability: "ignore", enqueued: false, runId: null, duplicate: true }` を返す
      3. delivery レコードを `deliveryRepository.save()` で永続化
      4. 既存の run 作成 + enqueue フローを実行
    - `IngestReviewEventResult` に `duplicate: boolean` と `runId: string | null` を追加
  - `ActionabilitySignal` の `signal` フィールドはそのまま維持（呼び出し側が `createDefaultActionabilitySignal()` を使う）
  - RED: `test/unit/application/ingest-review-event.test.ts` に以下を追加
    - 重複 deliveryId で duplicate: true が返る
    - 新規 deliveryId で delivery が永続化される
    - 既存テストを新しいインターフェースに合わせて更新
  - GREEN: 実装
  - REFACTOR: 必要に応じて

  **Must NOT do**:
  - ingestReviewEvent のシグネチャを根本的に変えない（拡張のみ）
  - delivery 内容の body テキスト解析

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 既存 use case の拡張 + 冪等性ロジック + 既存テスト更新。変更範囲が広い。
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（Wave 1 完了後）
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1 (headSha optional), 4 (normalization), 5 (DeliveryRepository), 8 (default signal)

  **References**:

  **Pattern References**:
  - `src/application/use-cases/ingest-review-event.ts:1-71` — 変更対象の全体（現在のフロー: run 作成 → enqueue）
  - `src/application/use-cases/ingest-review-event.ts:13-17` — IngestReviewEventDependencies（deliveryRepository 追加先）
  - `src/application/use-cases/ingest-review-event.ts:19-23` — IngestReviewEventInput（deliveryId 追加先）
  - `src/application/use-cases/ingest-review-event.ts:25-29` — IngestReviewEventResult（duplicate, runId nullable 化）

  **API/Type References**:
  - `src/adapters/persistence/delivery-repository.ts` — Task 5 で作成する DeliveryRepository interface
  - `src/domain/deliveries/webhook-delivery.ts` — Task 1 で作成する WebhookDelivery 型

  **Test References**:
  - `test/unit/application/ingest-review-event.test.ts:1-50` — 既存テスト全体（更新が必要）

  **WHY Each Reference Matters**:
  - `ingest-review-event.ts` は変更対象そのもの — 既存フローの理解が必須
  - `delivery-repository.ts` は新しい依存として追加する interface
  - 既存テストは新しいインターフェースに合わせて更新が必要

  **Acceptance Criteria**:
  - [ ] 重複 deliveryId → `{ duplicate: true, enqueued: false, runId: null }`
  - [ ] 新規 deliveryId → delivery が永続化 + run 作成 + enqueue
  - [ ] 既存テストが新インターフェースに対応して PASS
  - [ ] deliveryRepository に delivery が保存される
  - [ ] `pnpm test` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 重複 delivery の検出と拒否
    Tool: Bash (pnpm test)
    Preconditions: ingestReviewEvent 拡張済み
    Steps:
      1. deliveryRepository に deliveryId="dup-123" を事前に save
      2. ingestReviewEvent({...deps}, {deliveryId: "dup-123", ...input}) を呼ぶ
      3. result.duplicate === true を assert
      4. result.enqueued === false を assert
      5. result.runId === null を assert
      6. reviewJobQueue.snapshot() が空のまま（enqueue されてない）を assert
    Expected Result: duplicate: true で enqueue されない
    Failure Indicators: duplicate: false、または enqueue される
    Evidence: .sisyphus/evidence/task-9-duplicate-delivery.txt

  Scenario: 新規 delivery の正常処理
    Tool: Bash (pnpm test)
    Preconditions: ingestReviewEvent 拡張済み
    Steps:
      1. ingestReviewEvent({...deps}, {deliveryId: "new-456", ...input}) を呼ぶ
      2. result.duplicate === false を assert
      3. result.enqueued === true を assert
      4. result.runId !== null を assert
      5. deliveryRepository.findById("new-456") !== null を assert
    Expected Result: delivery 永続化 + run 作成 + enqueue
    Failure Indicators: delivery が保存されない、enqueue されない
    Evidence: .sisyphus/evidence/task-9-new-delivery.txt
  ```

  **Commit**: YES
  - Message: `feat(application): extend ingest flow with delivery persistence and idempotency`
  - Files: `src/application/use-cases/ingest-review-event.ts`, `test/unit/application/ingest-review-event.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 10. buildServer DI + raw body parser

  **What to do**:
  - `src/entrypoints/http/build-server.ts` を拡張:
    - `ServerDependencies` interface を定義:
      - `deliveryRepository: DeliveryRepository`
      - `reviewRunRepository: ReviewRunRepository`
      - `reviewJobQueue: ReviewJobQueue`
    - `buildServer(env, deps)` のシグネチャに `deps: ServerDependencies` を追加
    - Fastify の `addContentTypeParser` で `application/json` を raw body として取得可能にする
      - HMAC 検証には生の body 文字列が必要（JSON パース後では不可）
      - `request.rawBody` として保持するか、content parser で raw + parsed 両方を保持
  - 既存の health endpoint テストを更新（deps 引数追加）
  - RED: `test/integration/entrypoints/http/build-server.test.ts` の既存テストを deps 引数対応に更新
  - GREEN: 実装

  **Must NOT do**:
  - webhook ルートハンドラの実装（Task 11）
  - business logic の追加

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 既存ファイルのリファクタ。シグネチャ変更 + content parser 追加。
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Task 2 完了後）
  - **Parallel Group**: Wave 3（ただし Task 2 のみに依存なので Wave 2 で開始可能）
  - **Blocks**: Task 11
  - **Blocked By**: Task 2 (WEBHOOK_SECRET in config)

  **References**:

  **Pattern References**:
  - `src/entrypoints/http/build-server.ts:1-20` — 変更対象の全体
  - `src/adapters/persistence/review-run-repository.ts:3-6` — ReviewRunRepository interface（deps に追加）
  - `src/adapters/queue/review-job-queue.ts:3-5` — ReviewJobQueue interface（deps に追加）

  **Test References**:
  - `test/integration/entrypoints/http/build-server.test.ts:1-40` — 既存テスト全体（deps 追加で更新必要）

  **External References**:
  - Fastify docs: `addContentTypeParser` for raw body access

  **WHY Each Reference Matters**:
  - `build-server.ts` は変更対象 — DI 追加先
  - Repository/Queue interfaces は deps パラメータの型定義用
  - 既存テストは DI 変更で壊れるので更新が必要
  - Fastify docs は raw body 取得の正しいパターン確認

  **Acceptance Criteria**:
  - [ ] `buildServer(env, deps)` が deps を受け取る
  - [ ] raw body が `application/json` リクエストで取得可能
  - [ ] 既存の health endpoint テストが PASS
  - [ ] `pnpm typecheck` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: health endpoint が DI 変更後も動作する
    Tool: Bash (pnpm test)
    Preconditions: buildServer に deps パラメータ追加済み
    Steps:
      1. buildServer(env, inMemoryDeps) で server 生成
      2. server.inject({ method: "GET", url: "/health" }) を呼ぶ
      3. response.statusCode === 200 を assert
    Expected Result: health endpoint が従来通り 200 を返す
    Failure Indicators: 500 エラー、または deps 関連の型エラー
    Evidence: .sisyphus/evidence/task-10-health-after-di.txt

  Scenario: raw body が application/json で取得可能
    Tool: Bash (pnpm test)
    Preconditions: addContentTypeParser 追加済み
    Steps:
      1. server.inject({ method: "POST", url: "/webhook", payload: '{"test":true}', headers: {"content-type": "application/json"} }) を呼ぶ
      2. リクエストハンドラ内で raw body が文字列として取得できることを確認（route は Task 11 で追加、ここでは parser 設定のみ）
    Expected Result: content parser が設定されている
    Failure Indicators: raw body にアクセスできない
    Evidence: .sisyphus/evidence/task-10-raw-body.txt
  ```

  **Commit**: YES
  - Message: `refactor(http): add dependency injection and raw body parser to buildServer`
  - Files: `src/entrypoints/http/build-server.ts`, `test/integration/entrypoints/http/build-server.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 11. POST /webhook ルートハンドラ（TDD）

  **What to do**:
  - `src/entrypoints/http/webhook-route.ts` を新規作成
  - Fastify プラグイン/ルートとして POST /webhook を実装:
    1. `X-GitHub-Delivery` ヘッダー取得（なければ 400）
    2. `X-GitHub-Event` ヘッダー取得（なければ 400）
    3. `X-Hub-Signature-256` ヘッダー取得（なければ 401）
    4. `verifyWebhookSignature(secret, rawBody, signature)` で検証（失敗時 401）
    5. `normalizeWebhookEvent(eventType, action, payload)` で正規化（null なら 200 + `{status: "ignored"}`)
    6. `ingestReviewEvent(deps, {deliveryId, event, mode, signal})` を呼ぶ
       - signal は `createDefaultActionabilitySignal()`
       - mode は config.runMode
    7. duplicate なら 200 + `{status: "duplicate", deliveryId}`
    8. 成功なら 200 + `{status: "accepted", runId, actionability, enqueued}`
  - `build-server.ts` にルートを登録
  - RED: `test/unit/entrypoints/http/webhook-route.test.ts` で各パスをテスト
  - GREEN: 実装
  - REFACTOR: エラーハンドリング整理

  **Must NOT do**:
  - GitHub API 呼び出し
  - worker 処理の開始
  - write-back

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 全モジュールの結合点。複数のエラーパスと正常パスの処理。
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4 (normalization), 7 (signature verification), 9 (ingest flow), 10 (DI + raw body)

  **References**:

  **Pattern References**:
  - `src/entrypoints/http/build-server.ts` — server builder（ルート登録先）
  - `src/entrypoints/http/verify-webhook-signature.ts` — Task 7 で作成する署名検証
  - `src/domain/review-events/normalize-webhook-event.ts` — Task 4 で作成する正規化
  - `src/application/use-cases/ingest-review-event.ts` — 拡張済み ingest flow (Task 9)
  - `src/application/signals/default-actionability-signal.ts` — Task 8 で作成する stub signal

  **API/Type References**:
  - `src/config/env.ts` — RuntimeConfig.webhookSecret（Task 2 で追加）
  - `src/contracts/review-job-payload.ts` — response に含める runId 等の型

  **Test References**:
  - `test/integration/entrypoints/http/build-server.test.ts` — server.inject パターン

  **WHY Each Reference Matters**:
  - 全モジュールの結合点 — 各モジュールの API を正しく呼び出す必要がある
  - `build-server.ts` はルート登録先
  - 既存テストパターンは server.inject の使い方の参考

  **Acceptance Criteria**:
  - [ ] 有効な署名付きペイロード → 200 + `{status: "accepted"}`
  - [ ] 無効な署名 → 401
  - [ ] X-GitHub-Delivery なし → 400
  - [ ] X-GitHub-Event なし → 400
  - [ ] 未サポートイベント → 200 + `{status: "ignored"}`
  - [ ] 重複 delivery → 200 + `{status: "duplicate"}`
  - [ ] `pnpm test` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 有効な署名付き pull_request_review の受理
    Tool: Bash (pnpm test — server.inject)
    Preconditions: webhook route 実装済み、全依存モジュール注入済み
    Steps:
      1. pull_request_review フィクスチャを JSON.stringify
      2. @octokit/webhooks sign() で署名生成
      3. server.inject({
           method: "POST", url: "/webhook",
           headers: { "x-github-delivery": "uuid-1", "x-github-event": "pull_request_review", "x-hub-signature-256": signature, "content-type": "application/json" },
           payload: body
         })
      4. response.statusCode === 200 を assert
      5. response.json().status === "accepted" を assert
      6. response.json().enqueued === true を assert
    Expected Result: 200 + accepted + enqueued
    Failure Indicators: 401/400/500、または status !== "accepted"
    Evidence: .sisyphus/evidence/task-11-valid-webhook.txt

  Scenario: 無効な署名の拒否
    Tool: Bash (pnpm test — server.inject)
    Preconditions: webhook route 実装済み
    Steps:
      1. server.inject({
           method: "POST", url: "/webhook",
           headers: { "x-github-delivery": "uuid-2", "x-github-event": "pull_request_review", "x-hub-signature-256": "sha256=invalid", "content-type": "application/json" },
           payload: '{"action":"submitted"}'
         })
      2. response.statusCode === 401 を assert
    Expected Result: 401 Unauthorized
    Failure Indicators: 200 や他のステータスコード
    Evidence: .sisyphus/evidence/task-11-invalid-signature.txt

  Scenario: 未サポートイベントの無視
    Tool: Bash (pnpm test — server.inject)
    Preconditions: webhook route 実装済み
    Steps:
      1. 有効な署名を生成
      2. server.inject({...headers, "x-github-event": "push"}, payload) を呼ぶ
      3. response.statusCode === 200 を assert
      4. response.json().status === "ignored" を assert
    Expected Result: 200 + ignored
    Failure Indicators: 400/500
    Evidence: .sisyphus/evidence/task-11-unsupported-event.txt

  Scenario: 重複 delivery の安全な処理
    Tool: Bash (pnpm test — server.inject)
    Preconditions: webhook route 実装済み
    Steps:
      1. 同じ x-github-delivery ID で2回リクエスト
      2. 1回目: 200 + accepted を assert
      3. 2回目: 200 + duplicate を assert
      4. reviewJobQueue.snapshot() が 1件のみ（重複 enqueue なし）を assert
    Expected Result: 2回目は duplicate として処理
    Failure Indicators: 2回とも accepted、または2回 enqueue される
    Evidence: .sisyphus/evidence/task-11-duplicate-handling.txt
  ```

  **Commit**: YES
  - Message: `feat(http): add POST /webhook route handler with signature verification and normalization`
  - Files: `src/entrypoints/http/webhook-route.ts`, `src/entrypoints/http/build-server.ts`, `test/unit/entrypoints/http/webhook-route.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

- [x] 12. 統合テスト — 全パス検証

  **What to do**:
  - `test/integration/entrypoints/http/webhook-intake.test.ts` を新規作成
  - end-to-end の統合テスト（in-memory adapters 使用、DB 不要）:
    1. **Valid signed payload (pull_request_review)** — 200 + accepted + delivery 永続化 + run 永続化 + enqueue
    2. **Valid signed payload (issue_comment on PR)** — 200 + accepted + headSha null
    3. **Valid signed payload (pull_request_review_comment)** — 200 + accepted
    4. **Invalid signature** — 401 + no persistence
    5. **Missing X-GitHub-Delivery** — 400
    6. **Missing X-GitHub-Event** — 400
    7. **Unsupported event type** — 200 + ignored + no persistence
    8. **Duplicate delivery** — 200 + duplicate + no double enqueue
    9. **Unsupported action** — 200 + ignored
  - 各テストで in-memory repository/queue のスナップショットを検証

  **Must NOT do**:
  - Postgres / Docker 依存
  - 実際の GitHub API 呼び出し

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 9つのテストシナリオ。全モジュールの統合検証。
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 11)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 11 (webhook route), 3 (fixtures)

  **References**:

  **Pattern References**:
  - `test/integration/entrypoints/http/build-server.test.ts:1-40` — 既存の統合テストパターン（server.inject, afterEach cleanup）

  **Test References**:
  - `test/fixtures/webhooks/` — Task 3 で作成するフィクスチャ

  **WHY Each Reference Matters**:
  - 既存統合テストは server lifecycle 管理パターンの参考
  - フィクスチャは全テストの入力データ

  **Acceptance Criteria**:
  - [ ] 9つのテストシナリオが全て PASS
  - [ ] Issue #1 の Acceptance Criteria が全てカバーされている
  - [ ] in-memory adapter のみ使用（DB 不要）
  - [ ] `pnpm test` passes（全既存テスト + 新規テスト）
  - [ ] `pnpm lint` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 全統合テストの実行
    Tool: Bash (pnpm test)
    Preconditions: 全タスク完了済み
    Steps:
      1. pnpm test を実行
      2. webhook-intake.test.ts の全テストが PASS であることを確認
      3. 既存テストも引き続き PASS であることを確認
    Expected Result: 全テスト PASS
    Failure Indicators: テスト FAIL
    Evidence: .sisyphus/evidence/task-12-integration-tests.txt

  Scenario: lint + typecheck の通過
    Tool: Bash (pnpm lint)
    Preconditions: 全タスク完了済み
    Steps:
      1. pnpm lint を実行（biome + eslint + tsc --noEmit）
      2. 全チェック PASS を確認
    Expected Result: lint エラーなし
    Failure Indicators: lint/type エラー
    Evidence: .sisyphus/evidence/task-12-lint-check.txt
  ```

  **Commit**: YES
  - Message: `test(integration): add comprehensive webhook intake integration tests`
  - Files: `test/integration/entrypoints/http/webhook-intake.test.ts`
  - Pre-commit: `pnpm lint && pnpm test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `refactor(domain): make headSha optional and add delivery type` — review-feedback-event.ts, new delivery file
- **T2**: `feat(config): add WEBHOOK_SECRET environment variable` — env.ts
- **T3**: `test(fixtures): add GitHub webhook payload fixtures` — test/fixtures/
- **T4**: `feat(domain): add event normalization for PR review events` — domain + tests
- **T5**: `feat(adapters): add DeliveryRepository interface and in-memory impl` — adapters/persistence/
- **T6**: `feat(schema): add deliveries and idempotency_keys tables` — schema.ts
- **T7**: `feat(http): add webhook signature verification module` — entrypoints/http/ + tests
- **T8**: `feat(application): add default actionability signal helper` — application/
- **T9**: `feat(application): extend ingest flow with delivery persistence and idempotency` — use-cases/ + tests
- **T10**: `refactor(http): add DI and raw body parser to buildServer` — build-server.ts
- **T11**: `feat(http): add POST /webhook route handler` — entrypoints/http/ + tests
- **T12**: `test(integration): add full webhook intake integration tests` — test/integration/

---

## Success Criteria

### Verification Commands
```bash
pnpm lint       # Expected: all checks pass (biome + eslint + tsc)
pnpm test       # Expected: all tests pass (unit + integration)
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] Issue #1 の Acceptance Criteria 全項目が GREEN

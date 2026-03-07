# Learnings — webhook-intake


## 2025-03-07: WEBHOOK_SECRET Runtime Config

### Pattern: Required Secrets in Zod Schema
- Secrets like `WEBHOOK_SECRET` use `z.string().min(1)` without `.default()` — no fallback allowed
- Required fields cause `ZodError` when missing or empty, which is correct behavior for secrets

### TDD Flow for Config Changes
1. Write unit tests first for: missing → error, empty → error, present → returns value
2. Add to schema, interface, and return object
3. Update any integration tests that pass env objects directly

### Integration Test Fix
- `buildServer()` accepts raw env object, so any new required field must be added to all callers
- Pattern: `buildServer({ ..., WEBHOOK_SECRET: "test-secret" })`

### Files Modified
- `src/config/env.ts`: Added WEBHOOK_SECRET to schema, RuntimeConfig, loadRuntimeConfig
- `test/unit/config/env.test.ts`: New TDD tests for WEBHOOK_SECRET validation
- `test/integration/entrypoints/http/build-server.test.ts`: Added WEBHOOK_SECRET to env
## 2026-03-07: headSha Optional化 + WebhookDelivery型追加

### 実施内容
1. `ReviewFeedbackEvent.headSha` を `string` → `string | null` に変更
   - 理由: `issue_comment` webhookにはPR head SHAが含まれないため
   - `pull_request_review` と `pull_request_review_comment` は SHA を含む

2. 新規ドメイン型 `WebhookDelivery` を作成
   - 場所: `src/domain/deliveries/webhook-delivery.ts`
   - フィールド: id, eventType, action, receivedAt, processed
   - 将来的なwebhook重複処理防止用

3. アプリケーションロジック調整
   - `ingest-review-event.ts`: `headSha === null` の場合はジョブをエンキューしない
   - `ReviewJobPayload.headSha` は `string` のまま維持（worker側で解決）

### 設計判断
- `ReviewJobPayload` は `string` 必須を維持 → ジョブ実行時には SHA が必須
- `headSha: null` のイベントは保存されるが、ジョブはエンキューされない
- ドメイン型にコメントは不要 → フィールド名で自明

### TDD実践
- テスト先行: `test/unit/domain/review-feedback-event.test.ts` を最初に作成
- 2つのテストケース: `headSha: null` と `headSha: "abc123"` 両方を検証
- 型チェックとテスト両方で検証完了

### 影響範囲
- ドメイン層の変更のみ → 他レイヤーへの影響は最小
- 既存テストは全て通過（後方互換性維持）

## Webhook Fixture Patterns (2026-03-07)

### Minimal Payload Structure
- Use `as const` for type inference on fixture objects
- Include ONLY fields needed for normalization to `ReviewFeedbackEvent`
- Avoid `@types/` packages - plain objects are sufficient

### Event-Specific Fields
- `issue_comment` on PRs has `issue.pull_request` field (truthy = PR comment)
- `pull_request_review` and `pull_request_review_comment` have `pull_request.head.sha`
- Common fields: `action`, `sender.login`, `repository.owner.login`, `repository.name`

### Testing Approach
- Use helper functions to reduce cognitive complexity
- Use `expect().toBeDefined()` instead of if-throw patterns
- TypeScript infers non-nullish values from `as const`, avoid unnecessary optional chains
- TDD: write structure validation tests first (RED), then implement fixtures (GREEN)

### File Organization
- Fixtures: `test/fixtures/webhooks/*.ts`
- Tests: `test/unit/fixtures/webhook-fixtures.test.ts`
- Barrel export: `test/fixtures/webhooks/index.ts` with `.js` extension in imports

## 2026-03-07: DeliveryRepository + InMemoryDeliveryRepository

### 実施内容
1. `DeliveryRepository` インターフェース作成
   - 場所: `src/adapters/persistence/delivery-repository.ts`
   - メソッド: `save()`, `findById()`, `existsById()`
   - `existsById()` は冪等性チェック用（ReviewRunRepositoryにはない追加メソッド）

2. `InMemoryDeliveryRepository` 実装
   - 場所: `src/adapters/persistence/in-memory-delivery-repository.ts`
   - 内部で `Map<string, WebhookDelivery>` を使用
   - `InMemoryReviewRunRepository` パターンに準拠

3. TDD実践
   - テスト先行: `test/unit/adapters/in-memory-delivery-repository.test.ts`
   - 4テストケース: save→findById, findById(null), existsById(true), existsById(false)

### パターン
- Map-based実装: `Promise.resolve(this.map.get(id) ?? null)`
- `existsById`: `Promise.resolve(this.map.has(id))`
- テストは `test/unit/adapters/` に配置（新規ディレクトリ）

### ファイル
- Interface: `src/adapters/persistence/delivery-repository.ts`
- Implementation: `src/adapters/persistence/in-memory-delivery-repository.ts`
- Tests: `test/unit/adapters/in-memory-delivery-repository.test.ts`

## 2026-03-07: Webhook Signature Verification Module

### 実施内容
1. `verifyWebhookSignature(secret, payload, signature)` を追加
   - 場所: `src/entrypoints/http/verify-webhook-signature.ts`
   - 実装: `@octokit/webhooks` の `Webhooks#verify()` をラップ
   - 例外時は fail-fast せず `false` を返す（empty signature 含む）

2. TDDでユニットテスト追加（RED → GREEN）
   - 場所: `test/unit/entrypoints/http/verify-webhook-signature.test.ts`
   - ケース: valid=true / invalid=false / empty=false / mismatched secret=false
   - 署名生成はテスト内で `node:crypto` の `createHmac("sha256", secret)` を使用

### 重要な学び
- この環境では `@octokit/webhooks-methods` は直接 import できなかった
- `@octokit/webhooks` は `Webhooks` クラスを export し、`verify(payload, signature)` を提供している
- シグネチャ形式は `sha256=<hex_digest>` を前提にするとテストが安定する


## 2026-03-07: Webhook正規化モジュール（Zod safeParse）

### 正規化の設計
- `normalizeWebhookEvent(eventType, action, payload)` はサポート対象を厳密に分岐し、対象外は即 `null`
- `issue_comment` は `action === "created"` のみ受理し、`issue.pull_request` が存在しない payload は `null`
- `pull_request_review` は `submitted`、`pull_request_review_comment` は `created` のみ受理

### バリデーション方針
- 3イベントそれぞれに専用 Zod schema を定義し、`safeParse` 失敗時は必ず `null`
- malformed payload・非PR issue comment・不足フィールドは throw せず安全に `null` を返す
- `pull_request` existence チェックは `z.record(z.string(), z.unknown())` でオブジェクト必須化

### TDDメモ
- 先に7ケースのユニットテストを追加して RED（モジュール未作成）を確認
- 実装後に GREEN 化し、`receivedAt` は fake timer で固定値を厳密アサート
- 仕様確認として `headSha` は review系で文字列、issue_commentで `null` を明示検証

## 2026-03-07: Dependency Injection + Raw Body Parser in buildServer

### 実施内容
1. `ServerDependencies` インターフェース定義
   - `deliveryRepository: DeliveryRepository`
   - `reviewJobQueue: ReviewJobQueue`
   - `reviewRunRepository: ReviewRunRepository`
   - アルファベット順プロパティが規約

2. `buildServer(env, deps)` シグネチャ変更
   - 依存性注入パターン採用
   - テストでは in-memory 実装を使用

3. Raw Body Parser 追加
   - `addContentTypeParser("application/json", { parseAs: "string" }, ...)`
   - `req.rawBody` に生ボディ文字列を格納（HMAC検証用）
   - パース済み JSON も返却

4. Fastify Decorate パターン
   - `server.decorate("config", config)` + `server.decorate("deps", deps)`
   - ルートハンドラから `server.config`, `server.deps` でアクセス可
   - TypeScript 用に `declare module "fastify"` で型拡張

### 変更ファイル
- `src/entrypoints/http/build-server.ts`: DI + raw body parser
- `src/entrypoints/http/server.ts`: in-memory deps を一時的に使用（本番DB未実装のため）
- `test/integration/entrypoints/http/build-server.test.ts`: in-memory deps を注入

### セキュリティ関連コメント
- `// Store raw body on request for HMAC verification` は必要なコメント
- HMAC署名検証のために raw body が必要な理由を説明

### パターン
- Fastify module augmentation: `declare module "fastify" { interface FastifyInstance { ... } }`
- DI によりテスト容易性向上: 本番とテストで実装を切り替え可能

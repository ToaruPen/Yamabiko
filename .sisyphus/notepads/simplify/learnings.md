# 2026-03-07

- `safeParse -> null guard -> mapping` の重複は `parseAndMap` で共通化すると、イベントごとの差分（マッピング本体）だけが残って読みやすくなる。
- `pull_request.head.sha` と `pull_request.number` は `pullRequestSchema` を共有化して、スキーマ差分管理ミスを防げる。
- HTTP テストの `buildServer + in-memory repositories + env + webhook署名` は `test/helpers/create-test-server.ts` に集約すると、秘密鍵やENV差分のドリフトを防ぎつつ、各テストは検証ロジックに集中できる。
- テストフィクスチャビルダー（`createReviewRun` など）が複数ファイルで重複している場合、`test/fixtures/` に集約すると型定義の一貫性を保証でき、テストデータの変更が一箇所で済む。
- Fastify でカスタムリクエストプロパティ（rawBody など）を使う場合、`as unknown as` キャストではなく `declare module "fastify"` で `FastifyRequest` インターフェースを拡張すると、型安全かつファイル間で一貫したアクセスが可能になる。
- Zod スキーマで `DATABASE_URL` と `RUN_MODE` のような共通フィールドが重複している場合、`baseConfigSchema.extend({...})` で継承すると重複を排除でき、デフォルト値の変更も一箇所で済む。`workerConfigSchema = baseConfigSchema` と単純代入すれば、余計な空オブジェクトを避けられる。

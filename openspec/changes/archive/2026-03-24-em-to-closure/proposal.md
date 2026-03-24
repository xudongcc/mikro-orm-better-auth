## Why

`mikroOrmAdapter` 当前直接接受 `SqlEntityManager` 实例作为参数。这种设计在需要延迟获取 EntityManager 的场景下不够灵活——例如在 HTTP 请求上下文中通过 `RequestContext.getEntityManager()` 获取请求级别的 EntityManager，或在应用启动时 ORM 尚未初始化完成的场景。将参数改为闭包函数 `() => SqlEntityManager` 可以同时兼容两种常见用法。

## What Changes

- **BREAKING** `mikroOrmAdapter` 的第一个参数从 `em: SqlEntityManager` 改为 `getEntityManager: () => SqlEntityManager`
- 移除 `normalizeEntityManager` 工具函数中对实例的立即校验，改为在每次调用时延迟校验
- 更新所有测试用例的调用方式，使用闭包形式传入 EntityManager
- 更新 README 文档中的使用示例

## Capabilities

### New Capabilities

- `lazy-entity-manager`: 支持通过闭包函数延迟获取 EntityManager，兼容 `() => orm.em` 和 `() => RequestContext.getEntityManager()` 等不同使用场景

### Modified Capabilities

_(无现有 spec 需要修改)_

## Impact

- **API 签名变更（Breaking）**：`mikroOrmAdapter(em)` → `mikroOrmAdapter(() => em)`，所有使用者需更新调用方式
- **影响文件**：
  - `src/mikro-orm-adapter.ts` — 参数类型变更及内部 `baseEntityManager` 获取逻辑调整
  - `src/utils/entity-manager.ts` — `normalizeEntityManager` 校验逻辑适配闭包
  - `test/` 下所有引用 `mikroOrmAdapter` 的测试文件
  - `README.md` — 使用示例更新

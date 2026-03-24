## Context

`mikroOrmAdapter` 是 better-auth 的 MikroORM 适配器，当前签名为：

```ts
function mikroOrmAdapter(em: SqlEntityManager, config?: MikroOrmAdapterConfig)
```

调用时需要传入一个已初始化的 `SqlEntityManager` 实例。适配器内部已经使用了闭包模式（`createCustomAdapter` 接受 `getEntityManager: () => SqlEntityManager`），但对外暴露仍然是直接接受实例。

在 MikroORM 的 HTTP 请求处理中，通常使用 `RequestContext` 来隔离每个请求的 EntityManager。当前 API 无法优雅地支持这种模式。

## Goals / Non-Goals

**Goals:**
- 将 `mikroOrmAdapter` 的入参改为闭包函数 `() => SqlEntityManager`，使其能延迟获取 EntityManager
- 保持内部已有的闭包架构不变（`createCustomAdapter` 已经是闭包模式）
- 兼容 `() => orm.em` 和 `() => RequestContext.getEntityManager()` 两种使用场景

**Non-Goals:**
- 不做向后兼容（这是一个 Breaking Change，通过 semver major 版本处理）
- 不引入 overload 同时支持 `em` 和 `() => em` 两种签名（增加复杂度，收益低）
- 不修改适配器内部的查询逻辑和事务处理逻辑

## Decisions

### 1. 直接改为闭包，不做 overload 兼容

**选择**：将参数类型直接改为 `() => SqlEntityManager`，不提供 overload。

**理由**：
- overload 会增加类型复杂度
- 迁移成本很低（只需要在调用处加上 `() =>`）
- 作为 0.x 版本的库，Breaking Change 是可接受的

**替代方案**：
- overload 同时接受两种类型 → 增加维护负担，且两种签名会困惑用户
- 接受 `MikroORM` 实例而非 `SqlEntityManager` → 耦合度太高，不够灵活

### 2. 移除 `baseEntityManager` 的立即求值

**选择**：不再在适配器初始化时立即调用 `normalizeEntityManager`，改为在每次操作时通过闭包获取并校验。

**理由**：
- 延迟求值是闭包模式的核心价值
- `RequestContext.getEntityManager()` 在初始化时可能没有上下文，必须在请求处理时调用
- 事务中的 `trxEm` 已经是这种模式

### 3. 保留 `normalizeEntityManager` 校验

**选择**：保留 `normalizeEntityManager` 函数，但改为校验闭包返回值而非初始化参数。

**理由**：
- 运行时类型校验仍然有价值，能在调用时给出清晰的错误信息
- 只需调整调用位置，不需要删除

## Risks / Trade-offs

- **[初始化时错误检测延迟]** → 之前传入错误的 em 会在初始化时立即报错，改为闭包后会延迟到首次数据库操作时报错。这是可接受的权衡，因为闭包模式本身就是为了延迟求值。
- **[Breaking Change]** → 所有现有用户需要更新调用代码。迁移方式简单（加 `() =>`），通过 semver major 版本发布。

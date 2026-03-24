## 1. API 签名变更

- [x] 1.1 修改 `mikroOrmAdapter` 函数签名，将第一个参数从 `em: SqlEntityManager` 改为 `getEntityManager: () => SqlEntityManager`
- [x] 1.2 移除初始化时的 `normalizeEntityManager(em)` 调用，将闭包直接传给 `createCustomAdapter`
- [x] 1.3 更新事务处理中的 `baseEntityManager.transactional` 调用，改为通过闭包获取 EntityManager

## 2. 工具函数适配

- [x] 2.1 更新 `src/utils/entity-manager.ts` 中的 `normalizeEntityManager`，使其适配闭包返回值的校验场景（或在 `createCustomAdapter` 内部每次调用时校验）

## 3. 测试更新

- [x] 3.1 更新 `test/fixtures/auth.ts` 中的调用方式为 `mikroOrmAdapter(() => orm.em)`
- [x] 3.2 更新 `test/helpers.ts` 中的调用方式为闭包形式
- [x] 3.3 更新 `test/adapter.test.ts` 中的调用方式
- [x] 3.4 更新 `test/adapter-branches.test.ts` 中的调用方式
- [x] 3.5 更新 `test/create-schema.test.ts` 中的调用方式
- [x] 3.6 运行全部测试确保通过

## 4. 文档更新

- [x] 4.1 更新 `README.md` 中的使用示例，展示闭包形式的调用方式及 `RequestContext` 集成示例

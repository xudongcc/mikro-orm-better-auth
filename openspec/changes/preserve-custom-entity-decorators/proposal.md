## Why

当前实体生成器会整文件重写受管文件，一旦用户在生成后的实体上做了任何手写修改，重新生成就会把这些内容全部覆盖掉。这会直接阻断一个很常见的工作流：先生成 MikroORM 实体，再逐步补充 `@nestjs/graphql`、`class-validator`、领域方法、额外属性或其他业务代码。

## What Changes

- 将实体更新方式从整文件覆盖改为对既有受管文件执行 patch 式再生成。
- 在重新生成已有实体文件时，默认保留用户所有非生成器托管的代码修改。
- 将生成器的职责收敛为只 patch 自己负责的字段、类型和 MikroORM 装饰器等托管片段。
- 继续让生成器管理的表名、字段映射和属性元数据始终与最新 Better Auth schema 保持一致。
- 当文件无法安全合并时显式报错，而不是静默删除用户手写代码。
- 补充测试，验证重新生成后 `@nestjs/graphql`、`class-validator`、手写方法和额外属性等代码修改仍然保留。
- 文档化生成器管理范围与用户可修改范围，让使用者明确哪些内容会被自动更新，哪些内容会被原样保留。

## Capabilities

### New Capabilities
- `patch-generated-entities`: 通过 patch 方式重新生成受管 MikroORM 实体文件，默认保留用户手写代码，只更新生成器托管片段。

### Modified Capabilities

## Impact

- 影响基于 `ts-morph` 的 schema 生成器、生成文件生命周期以及再生成保护逻辑。
- 将 `createSchema` / `generateEntity` 的行为从破坏式覆盖调整为面向 patch 的受管文件再生成。
- 需要新增 AST 合并行为以及装饰器/import 保留场景的测试覆盖。
- 提升与下游框架的兼容性，允许在生成实体上安全叠加额外装饰器和校验规则。

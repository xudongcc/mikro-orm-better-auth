## ADDED Requirements

### Requirement: 受管实体再次生成时 SHALL 保留用户的非托管代码修改
生成器在重新生成 Better Auth 模型实体时，面对已存在的受管实体文件 SHALL 采用就地 patch，而不是替换整个文件；除生成器明确托管的片段之外，用户已有的代码修改 SHALL 被保留。

#### Scenario: 保留手写的类装饰器和属性装饰器
- **WHEN** 一个受管实体文件已经包含生成器拥有的 MikroORM 元数据，并且用户又手写添加了 `@ObjectType()`、`@Field()`、`@IsEmail()` 这类装饰器
- **THEN** 重新生成实体时会更新该模型对应的生成器托管 MikroORM 元数据
- **THEN** 这些手写装饰器在再生成后仍然保留在文件中

#### Scenario: 保留手写 import 和类成员
- **WHEN** 一个受管实体文件中包含手写 import，或者包含不来自 Better Auth schema 的额外类成员
- **THEN** 重新生成实体时会保留这些 import 和类成员

#### Scenario: 保留手写方法和额外属性
- **WHEN** 一个受管实体文件中包含用户手写的方法、getter、setter 或额外属性
- **THEN** 重新生成实体时不会删除这些代码片段

#### Scenario: 保留手写注释和文档
- **WHEN** 用户在受管实体类或其属性周围添加了注释或 JSDoc
- **THEN** 在不与生成器托管片段冲突的前提下，重新生成实体时会保留这些注释内容

### Requirement: 生成器托管的实体片段 SHALL 始终保持权威
生成器在每次重新生成时 SHALL 用当前 Better Auth schema 的结果替换掉生成器托管的实体片段，包括字段定义、类型和 MikroORM 元数据。

#### Scenario: 刷新表名和字段映射
- **WHEN** Better Auth schema 改变了模型表名、字段映射、字段可选性或生成默认元数据
- **THEN** 重新生成实体时会更新受管的 `@Entity`、`@PrimaryKey` 和 `@Property` 元数据以反映最新 schema

#### Scenario: 更新受管字段定义
- **WHEN** Better Auth schema 改变了某个受管字段的 TypeScript 类型、可选性或初始化器
- **THEN** 重新生成实体时会更新该字段对应的受管属性定义
- **THEN** 与该字段相关的非托管装饰器和非托管注释会尽可能被保留

#### Scenario: 移除过期的生成属性
- **WHEN** 一个此前由 Better Auth 字段生成的属性已经不再存在于当前 schema 中
- **THEN** 重新生成实体时会移除该字段对应的受管属性
- **THEN** 与此无关的手写类成员仍然保留在文件中

### Requirement: 不安全的受管文件状态 SHALL 显式失败
当生成器无法在不破坏非托管代码的前提下安全 patch 一个现有受管文件时，生成流程 SHALL 终止并给出清晰错误。

#### Scenario: 缺少受管实体类
- **WHEN** 一个文件带有受管文件头，但其中不包含目标模型期望的导出实体类
- **THEN** 重新生成会失败，并报错说明该受管文件无法被安全 patch

#### Scenario: 非受管目标文件仍然受到保护
- **WHEN** 目标实体文件存在，但不包含受管文件头
- **THEN** 重新生成会失败，而不是覆盖这个文件

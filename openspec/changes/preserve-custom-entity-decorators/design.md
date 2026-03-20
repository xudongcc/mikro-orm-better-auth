## Context

当前 [src/utils/schema-generator.ts](/Users/xudong/Projects/xudongcc/mikro-orm-better-auth/src/utils/schema-generator.ts) 中的生成器把每个受管实体文件都当成一次性产物处理。只要检测到受管文件头，就会以 `overwrite: true` 重新创建文件，这意味着手写的 import、装饰器、辅助方法、额外属性、注释和校验元数据都会在再生成时消失。这与真实项目里的常见使用方式冲突：团队通常会先生成一个基础的 MikroORM 实体，再持续补充框架装饰器、业务方法和领域代码。

这次变更要在保留“可生成实体”便利性的同时，让增量自定义后的再次生成变得安全。由于项目已经使用了 `ts-morph`，实现上可以继续走 AST 级 patch，而不必退回到脆弱的字符串 diff。核心约束是先定义清楚“生成器只负责 patch 哪些片段”，从而尽可能保留用户所有代码修改，而不是继续以文件级覆盖作为默认行为。

## Goals / Non-Goals

**Goals:**
- 在重新生成已有受管实体文件时，默认保留用户所有非生成器托管的代码修改。
- 让生成器只更新 Better Auth schema 派生出的字段、类型和 MikroORM 元数据。
- 让生成器管理的实体结构始终与 Better Auth 的表名、字段名、字段选项和 id 策略保持同步。
- 当生成器无法安全识别或 patch 受管类时，显式失败并给出清晰错误。
- 保持新生成文件的确定性和现有格式风格。
- 增加测试，覆盖 patch 行为以及常见的手写装饰器场景。

**Non-Goals:**
- 不支持跨多个类或同文件内无关顶层代码的任意语义合并。
- 不承诺保留用户直接修改生成器托管字段定义或 MikroORM 托管装饰器参数的行为。
- 不在这次变更中自动生成框架特定装饰器。
- 不在这次变更中引入“生成文件 + 手写伴生文件”的双文件模式。

## Decisions

### 1. 默认保留用户代码，生成器只 patch 托管片段

每个生成文件仍然只对应一个 Better Auth 模型的受管实体类。再次生成时，生成器会就地 patch 这个类，而不是替换整个文件。生成器只拥有以下片段的控制权：
- 受管文件头
- 生成结果所需的 MikroORM import 片段
- 目标模型对应的实体类声明中的受管 MikroORM 类装饰器
- `id` 属性和 Better Auth 字段对应的受管属性定义
- 这些受管属性上的 MikroORM 装饰器及其参数

除上述片段之外，其余代码默认都属于用户内容，应被保留，包括但不限于：
- 额外 import
- 类上的额外 decorators
- 受管属性上的非 MikroORM decorators
- 手写属性、方法、getter / setter
- 注释、JSDoc，以及与生成器无关的其他代码片段

Rationale:
- 这样可以让 schema 派生片段始终以生成器为唯一可信来源。
- 同时最大限度保留用户文件中的真实业务修改，而不是只保留少量白名单式扩展。
- 也更符合“代码生成器只维护自己负责的区域”这一长期可维护的模型。

Alternatives considered:
- 保持整文件覆盖，并要求用户把自定义逻辑移到别处。
  Rejected because it makes the generated entities impractical for common NestJS and validation use cases.
- 完全不区分托管边界，尝试保留并理解文件中的所有变化。
  Rejected because it makes schema synchronization too fragile and hard to reason about.

### 2. 通过 AST 协调 patch 既有文件，而不是做字符串 diff

对于已经存在的受管文件，生成器会通过 `ts-morph` 读取文件，定位到该模型对应的导出实体类，再把 import、装饰器和属性与一份“新鲜生成的内存表示”做协调。新文件仍然从零创建。

Rationale:
- 项目已经依赖 `ts-morph`，AST 协调与现有实现风格一致。
- 当 import 或装饰器顺序发生变化时，AST 操作比正则或字符串 patch 更稳。
- 也更容易基于明确规则保留用户手写装饰器和类成员。

Alternatives considered:
- 使用文本标记和字符串替换去 patch 文件。
  Rejected because decorators and imports are too easy to reorder or format differently.
- 先生成临时文件，再做按行 patch。
  Rejected because formatting churn would make merge behavior brittle.

### 3. 通过属性名匹配受管字段，只更新字段定义和 MikroORM 装饰器

协调器会以 Better Auth 字段名以及 `id` 作为受管成员标识。对于这些成员，生成器会更新 TypeScript 类型、可选性、初始化器，以及由最新 schema 推导出的 MikroORM 装饰器参数。挂在这些属性上的非 MikroORM 装饰器，例如 `@Field()`、`@IsEmail()`，以及这些属性周围的注释，应尽可能原样保留。

Rationale:
- 属性名在再生成过程中最稳定，本身就代表 Better Auth 字段身份。
- 使用者会预期 schema 变化覆盖 `@Property(...)` 和 `@PrimaryKey(...)` 这类托管元数据。
- 同时他们也会预期非托管代码不会因为再次生成而丢失。

Alternatives considered:
- 不区分归属，保留受管属性上的所有已有装饰器。
  Rejected because stale `@Property(...)` metadata would drift from the Better Auth schema.
- 直接替换整个属性声明。
  Rejected because it would still delete handwritten decorators, comments, and nearby custom code.

### 4. 按最小修改原则协调 import 和类结构

生成器会确保 `@mikro-orm/core` 所需 import 存在且始终最新，但不会重建整个 import 区块，也不会移除诸如 `@nestjs/graphql`、`class-validator` 这类无关 import。若此前生成的某个命名导入不再需要，只移除生成器拥有的那一部分，用户自有的 import 声明保持不动。类级结构调整也遵循最小修改原则，只动目标受管类中的受管片段。

Rationale:
- 自定义装饰器依赖对应 import，只保留装饰器而不保留 import 仍然会破坏文件。
- 按最小修改原则处理 import 和类结构，可以让再生成更可预测，同时避免破坏性清理。

Alternatives considered:
- 每次都重建整个 import 区块。
  Rejected because it would delete handwritten imports and cause unnecessary churn.

### 5. 对无法最小 patch 的文件显式失败，而不是降级为重写

如果一个受管文件缺少期望的导出实体类、包含多个可能匹配同一模型的类，或者已经被改造成协调器无法以最小 patch 安全更新的形态，生成流程会直接中止并给出清晰错误。非受管文件仍然继续受 overwrite 保护。

Rationale:
- 静默退回到破坏式重写，会直接破坏这次变更的目标。
- 清晰失败可以让“谁拥有哪部分代码”的边界保持可理解、可调试。

Alternatives considered:
- 对模糊文件自动从头重写。
  Rejected because it could still erase handwritten code unexpectedly.

## Risks / Trade-offs

- [用户修改了生成器托管的字段定义或 `@Property` / `@PrimaryKey` 元数据，后续会被覆盖] → 明确文档化托管边界，并且让生成器只更新这些明确托管的片段。
- [随着字段形态演进，AST patch 逻辑可能变复杂] → 把 import、类装饰器和属性协调逻辑集中封装，并补充聚焦测试。
- [模糊的既有文件状态可能导致再生成失败] → 提供可操作的错误信息，说明如何移动或清理不受支持的文件状态。
- [patch 后 import、装饰器或注释位置可能有轻微变化] → 通过 `ts-morph` 统一格式化和最小变更策略，尽量保持 diff 稳定。

## Migration Plan

1. 重构生成器，先构建一份期望中的实体内存表示，再决定如何落盘。
2. 为既有受管文件增加 patch 路径，协调 import、类装饰器和受管属性片段。
3. 保留用户其他代码修改，同时继续保留对不再需要的旧受管文件的清理行为。
4. 增加回归测试，覆盖装饰器、方法、属性和注释等手写代码保留，以及不安全合并失败场景。
5. 更新文档，明确新的再生成行为和生成器托管边界。

Rollback strategy:
- 如果 patch 协调逻辑在发布前被证明不稳定，就回退到旧的整文件覆盖行为。
- 如果发布后出现问题，可以在补丁版本里临时关闭选择性保留逻辑，同时保留对手写文件的 overwrite 保护。

## Open Questions

- 生成属性上的手写装饰器，是否需要严格保留与 MikroORM 装饰器的相对顺序，还是允许做稳定但不同的重排？
- 注释、JSDoc 和属性周围的空行，是否要作为“尽力保留”还是“必须保留”的语义来实现？

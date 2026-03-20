## Context

当前实体生成器在 [src/utils/schema-generator.ts](/Users/xudong/Projects/xudongcc/mikro-orm-better-auth/src/utils/schema-generator.ts) 中只调用了 `ts-morph` 的 `formatText()`。这能提供基础的 AST 格式整理，但它并不会读取仓库里的 `.prettierrc`、`.editorconfig` 或未来可能调整的 Prettier 配置，因此生成结果和项目真实采用的代码风格之间仍然可能存在差异。现在仓库已经安装了 Prettier，并且开发流程本身依赖 `pnpm format` / `pnpm format:fix`，说明代码风格的最终权威已经是 Prettier 而不是 `ts-morph`。

如果要让生成结果在 CLI 产出时就直接符合项目风格，最自然的做法是在生成后再走一次 Prettier。这个变化看起来只是“再格式化一下”，但实际涉及运行时依赖、配置解析边界，以及格式化失败时的行为选择，因此值得用单独的设计文档固定方案。

## Goals / Non-Goals

**Goals:**
- 让生成器输出的实体文件直接遵循仓库的 Prettier 规则。
- 保持现有 `ts-morph` 生成和 patch 逻辑不变，只在最终写入前增加一个 Prettier 格式化步骤。
- 为格式化失败提供清晰错误，避免静默生成风格不一致的代码。
- 补充测试，验证生成结果经过 Prettier 后仍然保持内容正确。
- 让发布后的包在真实用户环境中也能调用到 Prettier。

**Non-Goals:**
- 不在这次变更中支持可选关闭 Prettier 的新配置项。
- 不重新设计生成器的 AST patch 策略。
- 不在这次变更中支持多格式化器或用户自定义 formatter 抽象。

## Decisions

### 1. 保留 `ts-morph` 作为结构整理工具，再用 Prettier 做最终格式化

生成器仍然继续使用 `ts-morph` 负责 AST 级构造、patch 和基础 `formatText()`，然后在文件最终写入前调用 Prettier 对完整源码字符串做最后一轮格式化。

Rationale:
- `ts-morph` 擅长安全修改 AST，Prettier 擅长让最终文本符合项目风格，这两者职责天然互补。
- 如果完全去掉 `ts-morph` 格式化，部分中间 AST 输出在送入 Prettier 前可读性更差，也更难排查问题。
- 在现有实现上增加最终格式化步骤，改动面最小。

Alternatives considered:
- 只保留 `ts-morph` 的 `formatText()`。
  Rejected because it still cannot保证和项目的 Prettier 配置一致。
- 完全不调用 `ts-morph.formatText()`，只依赖 Prettier。
  Rejected because当前实现已经依赖 `ts-morph` 做稳定的结构整理，直接拿掉会增加额外变更面。

### 2. 直接调用 Prettier API，并按输出文件路径解析配置

生成器会使用 Prettier 的程序化 API，并基于目标输出文件路径调用 `resolveConfig()` / `format()`，让 `.prettierrc`、`prettier.config.*`、文件扩展名等都按正常规则生效。

Rationale:
- 用户要求的是“生成的代码直接调用 Prettier 格式化”，程序化 API 最直接。
- 基于 `filepath` 调用格式化，Prettier 才能正确选择 TypeScript parser 并按文件路径查找配置。

Alternatives considered:
- 直接 shell out 执行 `prettier --write`。
  Rejected because额外进程开销更大，也更难处理错误和返回值。
- 手写一套和 Prettier 类似的格式规则。
  Rejected because这会重复造轮子，而且很快就会和项目真实风格漂移。

### 3. 将 Prettier 视为生成器的运行时依赖

既然 `createSchema` / `generateEntity` 是包对外提供的运行时能力，调用 Prettier 也属于运行时行为，因此 Prettier 需要作为可发布运行时依赖提供，而不能只留在 `devDependencies`。

Rationale:
- 当前仓库里 Prettier 只在开发脚本中使用，但这次变更后生成器运行时也会直接调用它。
- 如果只放在 `devDependencies`，发布给外部用户后运行 `createSchema` 时可能找不到 Prettier。

Alternatives considered:
- 保持 Prettier 只在 `devDependencies`，假设用户自己安装。
  Rejected because这会让运行时行为依赖隐式环境条件，容易在真实项目里失败。
- 把 Prettier 作为 peer dependency。
  Rejected because对用户来说配置和安装成本更高，而这里并不需要由用户自行决定版本边界。

### 4. 格式化失败时显式报错，而不是静默降级

如果 Prettier 配置解析失败、格式化失败，或程序化 API 抛出异常，生成器将抛出带上下文的错误，而不是悄悄回退到仅 `ts-morph` 格式化后的结果。

Rationale:
- 这次 change 的目标就是让生成结果直接符合 Prettier 规则，静默降级会让用户误以为结果已经符合预期。
- 明确报错更容易暴露配置问题，也更利于 CI 与 CLI 行为保持一致。

Alternatives considered:
- 失败时回退到 `ts-morph` 格式化结果。
  Rejected because这会制造“有时遵循 Prettier、有时不遵循”的不稳定行为。

## Risks / Trade-offs

- [新增运行时依赖会让发布包体积略有增加] → 接受这部分成本，换取生成结果和仓库格式规则一致。
- [用户项目中的 Prettier 配置错误会直接导致生成失败] → 提供清晰报错信息，指出失败发生在生成后的 Prettier 步骤。
- [Prettier 版本变更可能导致生成快照变化] → 在测试中对关键输出片段做断言，而不是过度依赖整文件文本快照。

## Migration Plan

1. 将 Prettier 作为生成器运行时可用依赖。
2. 在 `schema-generator` 的最终写入阶段引入 Prettier 格式化。
3. 增加针对生成输出与格式化失败行为的测试。
4. 更新 README，说明生成结果会自动套用 Prettier。

Rollback strategy:
- 如果程序化 Prettier 调用在真实环境中出现不稳定，可以回退到当前仅使用 `ts-morph` 格式化的实现。
- 回退时只需要移除最终格式化步骤和对应运行时依赖，不影响生成器主体逻辑。

## Open Questions

- 是否要在错误信息里显式提示“请检查仓库 Prettier 配置”，还是只透传原始 Prettier 报错？
- 后续是否需要把 Prettier 格式化抽成独立工具函数，便于其他生成器复用？

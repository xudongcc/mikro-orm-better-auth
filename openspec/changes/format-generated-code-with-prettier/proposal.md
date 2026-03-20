## Why

当前实体生成器只依赖 `ts-morph` 自带的格式化能力，输出风格与仓库实际使用的 Prettier 规则并不完全一致。这会导致生成后的代码在提交前还需要额外再跑一次格式化，增加心智负担，也让生成结果不够稳定。

## What Changes

- 在实体生成完成后，直接调用项目中的 Prettier 对生成文件做格式化。
- 让生成结果自动遵循仓库现有的 Prettier 配置，而不是只依赖 `ts-morph` 的默认格式化行为。
- 在无法解析或执行 Prettier 时提供清晰的降级或报错行为，避免静默输出风格异常的代码。
- 为生成器补充测试，验证生成结果经过 Prettier 后仍然符合预期内容与可用性。
- 更新文档，说明生成代码会自动套用 Prettier 样式。

## Capabilities

### New Capabilities
- `prettier-formatted-generation`: 生成实体文件后自动使用仓库的 Prettier 配置进行格式化。

### Modified Capabilities

## Impact

- 影响 `ts-morph` 实体生成流程和最终写入文件前后的格式化步骤。
- 直接使用项目内已有的 `prettier` 依赖与配置。
- 需要新增生成器测试，覆盖 Prettier 格式化后的输出稳定性与失败场景。
- 会让 CLI 生成出的实体文件与仓库整体格式风格保持一致。

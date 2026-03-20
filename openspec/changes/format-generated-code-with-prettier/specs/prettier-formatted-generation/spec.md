## ADDED Requirements

### Requirement: 生成实体文件时 SHALL 自动应用 Prettier 格式化
生成器在写入 Better Auth 实体文件前 SHALL 调用 Prettier 对最终源码做格式化，并基于目标文件路径应用项目的 Prettier 配置。

#### Scenario: 新生成文件遵循 Prettier 规则
- **WHEN** 生成器创建一个新的实体文件
- **THEN** 写入磁盘的最终内容已经经过 Prettier 格式化
- **THEN** 生成结果符合项目当前的 Prettier 风格

#### Scenario: patch 后的文件仍遵循 Prettier 规则
- **WHEN** 生成器对已有实体文件进行 patch 更新
- **THEN** patch 后写回磁盘的最终内容已经经过 Prettier 格式化
- **THEN** 保留的用户代码与更新后的生成代码共享统一的格式风格

### Requirement: Prettier 格式化失败时 SHALL 显式报错
当生成器无法成功调用 Prettier 或无法完成格式化时，生成流程 SHALL 终止并返回清晰错误，而不是静默降级为未经过 Prettier 的输出。

#### Scenario: 配置或格式化失败
- **WHEN** Prettier 在解析配置或格式化源码时抛出错误
- **THEN** 生成流程失败
- **THEN** 错误信息明确指出失败发生在 Prettier 格式化阶段

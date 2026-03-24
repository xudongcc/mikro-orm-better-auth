## ADDED Requirements

### Requirement: Adapter accepts closure for EntityManager

`mikroOrmAdapter` SHALL accept a closure function `() => SqlEntityManager` as its first parameter instead of a direct `SqlEntityManager` instance.

#### Scenario: Using with static EntityManager
- **WHEN** user calls `mikroOrmAdapter(() => orm.em, config)`
- **THEN** the adapter SHALL use the EntityManager returned by the closure for each database operation

#### Scenario: Using with RequestContext
- **WHEN** user calls `mikroOrmAdapter(() => RequestContext.getEntityManager()!, config)`
- **THEN** the adapter SHALL call the closure on each database operation to obtain the current request-scoped EntityManager

#### Scenario: Closure returns invalid EntityManager
- **WHEN** the closure returns a value that is not a valid `SqlEntityManager` (missing `getKnex` method)
- **THEN** the adapter SHALL throw a `TypeError` with a descriptive message at the time of the database operation

### Requirement: Deferred EntityManager resolution

The adapter SHALL NOT call the closure at initialization time. The closure SHALL be invoked lazily at the time of each database operation.

#### Scenario: Adapter initialization without active RequestContext
- **WHEN** the adapter is created with `() => RequestContext.getEntityManager()!` and no RequestContext is active at initialization time
- **THEN** the adapter SHALL initialize successfully without error
- **AND** the closure SHALL only be called when a database operation (create, findOne, update, delete, etc.) is executed

### Requirement: Transaction support with closure

The adapter's transaction support SHALL continue to work correctly with the closure-based API.

#### Scenario: Transaction creates isolated EntityManager
- **WHEN** a transaction is initiated via the adapter
- **THEN** the adapter SHALL use the transactional EntityManager (`trxEm`) for all operations within the transaction scope, independent of the closure provided at initialization

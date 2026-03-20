## ADDED Requirements

### Requirement: Adapter factory initialization
The package SHALL export a Better Auth adapter factory for MikroORM that accepts a MikroORM entity manager, or a function returning one, plus adapter configuration for schema naming and database capability flags. The adapter SHALL honor Better Auth's transformed model and field naming helpers and SHALL advertise native join support as disabled in the initial release.

#### Scenario: Consumer creates an adapter with SQL-friendly defaults
- **WHEN** a consumer creates the MikroORM adapter with a SQL-backed entity manager and no special overrides
- **THEN** the adapter is created successfully with Better Auth capability flags suitable for SQL databases
- **THEN** Better Auth can use the adapter without requiring consumer-defined auth entities

#### Scenario: Consumer customizes schema naming behavior
- **WHEN** a consumer enables plural table naming or overrides capability flags in the adapter config
- **THEN** the adapter passes those settings through Better Auth's adapter factory configuration
- **THEN** subsequent adapter operations use the transformed model and field names derived from those settings

### Requirement: Schema-aware write operations
The adapter SHALL implement Better Auth write operations for `create`, `update`, `updateMany`, `delete`, and `deleteMany` against the transformed database model names and field names provided by Better Auth. Single-record writes SHALL return the resulting record, and bulk writes SHALL return the affected row count required by the Better Auth contract.

#### Scenario: Create stores a record using transformed names
- **WHEN** Better Auth calls `create` for a model whose table or columns were renamed through schema configuration
- **THEN** the adapter writes to the transformed table and transformed column names
- **THEN** the adapter returns the inserted record in the shape Better Auth expects

#### Scenario: Bulk updates return the affected count
- **WHEN** Better Auth calls `updateMany` or `deleteMany` with a valid filter
- **THEN** the adapter applies the filter to the transformed table
- **THEN** the adapter returns the number of affected rows

### Requirement: Filtered read operations
The adapter SHALL implement `findOne`, `findMany`, and `count` with support for Better Auth's transformed `where` clauses, field selection hints, sorting, limits, and offsets. Read operations SHALL return records that Better Auth can transform back into its schema-facing shape.

#### Scenario: Find one respects filters and field selection
- **WHEN** Better Auth calls `findOne` with a transformed `where` clause and a `select` hint
- **THEN** the adapter applies the filter to the correct table and columns
- **THEN** the adapter returns the matching record so Better Auth can project the requested fields

#### Scenario: Find many supports pagination and sorting
- **WHEN** Better Auth calls `findMany` with `where`, `sortBy`, `limit`, and `offset`
- **THEN** the adapter returns rows in the requested order
- **THEN** the adapter enforces the requested page window

#### Scenario: Count matches the filtered result set
- **WHEN** Better Auth calls `count` with a transformed filter
- **THEN** the adapter counts rows from the transformed table using the same filter semantics as `findMany`
- **THEN** the returned count matches the number of rows that satisfy the filter

### Requirement: Transactional execution
The adapter SHALL expose Better Auth transaction support through MikroORM so that Better Auth can execute grouped operations atomically when the underlying SQL driver supports transactions.

#### Scenario: Successful transaction commits grouped writes
- **WHEN** Better Auth executes multiple adapter writes inside a transaction callback that completes successfully
- **THEN** the adapter runs those writes inside a MikroORM transaction
- **THEN** all writes are committed together

#### Scenario: Failed transaction rolls back grouped writes
- **WHEN** Better Auth executes multiple adapter writes inside a transaction callback and one write fails
- **THEN** the adapter rolls back the MikroORM transaction
- **THEN** none of the writes from that callback remain persisted

### Requirement: Schema generation outputs MikroORM entity files
The adapter SHALL implement `createSchema` so it can generate MikroORM entity source files from Better Auth model metadata and schema transformations. Generated files SHALL reflect transformed table names and transformed field names, and SHALL be emitted through a managed code-generation flow built on `ts-morph`.

#### Scenario: Create schema generates entity files for Better Auth models
- **WHEN** a consumer runs the adapter's `createSchema` flow against the Better Auth schema configuration
- **THEN** the adapter generates MikroORM entity files for the Better Auth models in the configured output location
- **THEN** each generated entity reflects the transformed table name and field mappings from the Better Auth schema

#### Scenario: Regenerating schema updates managed entity files deterministically
- **WHEN** a consumer reruns `createSchema` for the same managed output directory after changing Better Auth schema configuration
- **THEN** the adapter updates the generated entity files deterministically through the managed `ts-morph` generation flow
- **THEN** the resulting files stay aligned with the latest Better Auth model metadata

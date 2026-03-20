export function normalizeAffectedRows(result: unknown): number {
  if (typeof result === "number") {
    return result;
  }

  if (Array.isArray(result) && typeof result[0] === "number") {
    return result[0];
  }

  return 0;
}

export function normalizeCount(
  row: Record<string, unknown> | undefined | null,
): number {
  if (!row) {
    return 0;
  }

  const value = row.count ?? Object.values(row)[0];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return 0;
}

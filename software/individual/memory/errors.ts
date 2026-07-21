export class PersistenceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidPersistenceKeyError extends PersistenceError {
  constructor(key: string) {
    super(
      `Persistence key "${key}" is invalid. Keys may contain letters, numbers, underscores, and hyphens only.`,
      "INVALID_PERSISTENCE_KEY",
    );
  }
}

export class PersistenceReadError extends PersistenceError {
  constructor(filePath: string, options?: ErrorOptions) {
    super(`Unable to read durable data at "${filePath}".`, "PERSISTENCE_READ_FAILED", options);
  }
}

export class PersistenceWriteError extends PersistenceError {
  constructor(filePath: string, options?: ErrorOptions) {
    super(`Unable to write durable data at "${filePath}".`, "PERSISTENCE_WRITE_FAILED", options);
  }
}

export class PersistenceSizeError extends PersistenceError {
  constructor(filePath: string, readonly maxBytes: number) {
    super(
      `Durable data at "${filePath}" exceeds the ${maxBytes}-byte read limit.`,
      "PERSISTENCE_SIZE_LIMIT",
    );
  }
}

export class PersistenceQuotaError extends PersistenceError {
  constructor(
    readonly scope: string,
    readonly limit: number,
    readonly unit: "bytes" | "files" = "bytes",
  ) {
    super(
      `Durable ${scope} exceeds its configured ${limit}-${unit} quota.`,
      "PERSISTENCE_QUOTA_EXCEEDED",
    );
  }
}

export class CorruptPersistenceError extends PersistenceError {
  constructor(
    filePath: string,
    readonly quarantinePath: string | undefined,
    options?: ErrorOptions,
  ) {
    const suffix = quarantinePath
      ? ` The invalid file was quarantined at "${quarantinePath}".`
      : " The invalid file could not be quarantined and was left in place.";
    super(
      `Durable data at "${filePath}" is corrupt or incompatible.${suffix}`,
      "PERSISTENCE_CORRUPT",
      options,
    );
  }
}

/** Stable public error for an identity whose quarantine marker is active. */
export class IdentityQuarantinedError extends PersistenceError {
  constructor(readonly individualId: string) {
    super(
      `Durable identity "${individualId}" is quarantined and requires explicit administrative recovery.`,
      "PERSISTENCE_QUARANTINED",
    );
  }
}

export class PersistenceConflictError extends PersistenceError {
  constructor(message: string) {
    super(message, "PERSISTENCE_CONFLICT");
  }
}

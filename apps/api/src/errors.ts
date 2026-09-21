/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** A failed call to an outside price source. */
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Retrying won't help (bad key, not subscribed, ...). */
    readonly permanent = false,
  ) {
    super(message);
  }
}

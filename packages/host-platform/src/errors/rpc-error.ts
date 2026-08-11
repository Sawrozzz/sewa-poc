/** Host-side RPC error carrying a stable wire `code`. */
export class RpcMethodError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "RpcMethodError";
    this.code = code;
    this.retryable = retryable;
  }
}

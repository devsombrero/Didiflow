export interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

export type RecordedCall = [method: string, args: unknown[]];

export interface QueryMock {
  readonly calls: RecordedCall[];
  /** Arguments of the first call to `method`, if any. */
  argsOf(method: string): unknown[] | undefined;
}

/**
 * Chainable stand-in for a PostgREST query builder: every method call is
 * recorded and returns the builder; awaiting it resolves to `result`.
 */
export function queryMock(result: QueryResult): QueryMock & PromiseLike<QueryResult> {
  const calls: RecordedCall[] = [];
  const target = {
    calls,
    argsOf: (method: string) => calls.find(([name]) => name === method)?.[1],
  };
  const proxy: unknown = new Proxy(target, {
    get(obj, prop) {
      if (prop === 'then') {
        return (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (prop in obj) return obj[prop as keyof typeof obj];
      return (...args: unknown[]) => {
        calls.push([String(prop), args]);
        return proxy;
      };
    },
  });
  return proxy as QueryMock & PromiseLike<QueryResult>;
}

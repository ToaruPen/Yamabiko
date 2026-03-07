declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    command: string;
    fields: unknown[];
    oid: number;
    rowCount: number | null;
    rows: R[];
  }

  export interface QueryConfig {
    name?: string;
    rowMode?: "array";
    text: string;
    values?: readonly unknown[];
  }

  export interface ClientConfig {
    connectionString?: string;
  }

  export interface PoolConfig extends ClientConfig {
    max?: number;
    min?: number;
  }

  export class Client {
    public constructor(config?: string | ClientConfig);
    public end(): Promise<void>;
    public query<R extends QueryResultRow = QueryResultRow>(
      queryTextOrConfig: string | QueryConfig,
      values?: readonly unknown[],
    ): Promise<QueryResult<R>>;
  }

  export interface PoolClient extends Client {
    release(destroy?: boolean): void;
  }

  export class Pool {
    public constructor(config?: PoolConfig);
    public connect(): Promise<PoolClient>;
    public end(): Promise<void>;
    public query<R extends QueryResultRow = QueryResultRow>(
      queryTextOrConfig: string | QueryConfig,
      values?: readonly unknown[],
    ): Promise<QueryResult<R>>;
  }

  const pg: {
    Client: typeof Client;
    Pool: typeof Pool;
  };

  export default pg;
}

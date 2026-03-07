export type AuthTokenKind = "github-app" | "github-token" | "pat";

export interface AuthToken {
  kind: AuthTokenKind;
  token: string;
}

export interface TokenProvider {
  getToken(): Promise<AuthToken>;
}

export interface SymbolIdentity {
  readonly uri: string;
  readonly kind: number;
  readonly name: string;
  readonly detail?: string;
  readonly line: number;
  readonly character: number;
}

export function createSymbolKey(identity: SymbolIdentity): string {
  return [
    identity.uri,
    identity.kind,
    identity.name,
    identity.detail ?? '',
    identity.line,
    identity.character,
  ].join('#');
}

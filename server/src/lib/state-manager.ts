export default class StateManager {
  private stylexIdentifier: Set<string> = new Set();
  private namedImportMap: Map<string, Set<string>> = new Map();
  private localIdentifierMap: Map<string, string> = new Map();
  private constantScopeStack: Map<string, any>[] = [];
  private variableToScopeMap = new Map<string, number[]>();
  private variableGroupMap = new Map<string, string>();

  constructor() {
    // Default stylex identifier, configurable in the future
    this.stylexIdentifier.add("stylex");
  }

  public addStylexIdentifier(identifier: string) {
    this.stylexIdentifier.add(identifier);
  }

  public verifyStylexIdentifier(identifier: string) {
    return this.stylexIdentifier.has(identifier);
  }

  public addNamedImport(localIdentifier: string, importedIdentifier: string) {
    if (!this.namedImportMap.has(importedIdentifier)) {
      this.namedImportMap.set(importedIdentifier, new Set());
    }
    this.namedImportMap.get(importedIdentifier)?.add(localIdentifier);
    this.localIdentifierMap.set(localIdentifier, importedIdentifier);
  }

  public verifyNamedImport(localIdentifier: string) {
    return this.localIdentifierMap.has(localIdentifier)
      ? this.localIdentifierMap.get(localIdentifier)
      : undefined;
  }

  public pushConstantScope() {
    this.constantScopeStack.push(new Map());
  }

  public popConstantScope() {
    // Ensure we have a scope to pop
    if (this.constantScopeStack.length === 0) {
      throw new Error("Cannot pop constant scope from empty stack");
    }

    // Pop scope from all variables in this scope
    for (const key of this.constantScopeStack.at(-1)!.keys()) {
      const nextVarScope = this.variableToScopeMap.get(key);
      if (!nextVarScope) continue;
      nextVarScope.pop();
      if (!nextVarScope.length) {
        this.variableToScopeMap.delete(key);
      }
      this.variableToScopeMap.set(key, nextVarScope);
    }

    // Pop this scope itself
    this.constantScopeStack.pop();
  }

  public addConstantToScope(identifier: string, value: any) {
    if (this.constantScopeStack.length === 0) {
      throw new Error("Cannot add constant to empty stack");
    }
    this.constantScopeStack.at(-1)!.set(identifier, value);
    if (!this.variableToScopeMap.has(identifier)) {
      this.variableToScopeMap.set(identifier, []);
    }
    this.variableToScopeMap
      .get(identifier)
      ?.push(this.constantScopeStack.length - 1);
  }

  public getConstantFromScope(identifier: string) {
    if (this.constantScopeStack.length === 0) {
      return undefined;
    }

    return this.constantScopeStack
      .at(this.variableToScopeMap.get(identifier)?.at(-1) || 0)
      ?.get(identifier);
  }
}

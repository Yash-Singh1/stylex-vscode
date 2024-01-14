import { describe, expect, test } from "vitest";
import StateManager from "../../src/lib/state-manager";

const testStateManager = test.extend<{ stateManager: StateManager }>({
  stateManager: async ({}, use) => {
    await use(new StateManager());
  },
});

describe("StateManager", () => {
  testStateManager("constructor", ({ stateManager }) => {
    expect(stateManager).toBeDefined();
    expect(stateManager.verifyStylexIdentifier("stylex")).toBe(true);
  });

  testStateManager("handles stylex identifiers", ({ stateManager }) => {
    stateManager.addStylexIdentifier("foo");
    expect(stateManager.verifyStylexIdentifier("foo")).toBe(true);
    expect(stateManager.verifyStylexIdentifier("bar")).toBe(false);
    expect(stateManager.verifyStylexIdentifier("stylex")).toBe(true);
  });

  testStateManager("handles named imports", ({ stateManager }) => {
    stateManager.addNamedImport("foo", "bar");
    expect(stateManager.verifyNamedImport("foo")).toBe("bar");
    expect(stateManager.verifyNamedImport("bar")).toBeUndefined();
  });

  testStateManager("handles constant scopes", ({ stateManager }) => {
    stateManager.pushConstantScope();
    stateManager.addConstantToScope("foo", "bar");
    stateManager.addConstantToScope("bar", "baz");
    stateManager.pushConstantScope();
    stateManager.addConstantToScope("baz", "foo");
    stateManager.addConstantToScope("foo", "bar2");
    expect(stateManager.getConstantFromScope("foo")).toBe("bar2");
    expect(stateManager.getConstantFromScope("bar")).toBe("baz");
    expect(stateManager.getConstantFromScope("baz")).toBe("foo");
    stateManager.popConstantScope();
    expect(stateManager.getConstantFromScope("foo")).toBe("bar");
    expect(stateManager.getConstantFromScope("bar")).toBe("baz");
  });
});

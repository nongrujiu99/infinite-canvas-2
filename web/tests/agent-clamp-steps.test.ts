import { expect, test } from "bun:test";

// i18n 初始化依赖浏览器 localStorage，测试环境需在加载被测模块前打桩
const memoryStorage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStorage.set(key, value),
    removeItem: (key: string) => void memoryStorage.delete(key),
    clear: () => void memoryStorage.clear(),
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    get length() {
        return memoryStorage.size;
    },
};

// 用动态 import 避免 ESM 静态提升导致 i18n 在打桩前加载
const { clampAgentSteps } = await import("../src/services/api/agent");

test("defaults to 8 steps when no value is given", () => {
    expect(clampAgentSteps()).toBe(8);
});

test("clamps values below the minimum to 1", () => {
    expect(clampAgentSteps(0)).toBe(1);
    expect(clampAgentSteps(-5)).toBe(1);
});

test("clamps values above the maximum to 20", () => {
    expect(clampAgentSteps(100)).toBe(20);
});

test("keeps values within range unchanged", () => {
    expect(clampAgentSteps(3)).toBe(3);
    expect(clampAgentSteps(15)).toBe(15);
});

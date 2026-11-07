import { expect, test } from "bun:test";

import { trimTo } from "../src/stores/agent/use-agent-store";

test("keeps the list unchanged when under the limit", () => {
    expect(trimTo([1, 2, 3], 5)).toEqual([1, 2, 3]);
});

test("drops the oldest items when over the limit", () => {
    expect(trimTo([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
});

test("returns an empty list when limit is zero", () => {
    expect(trimTo([1, 2], 0)).toEqual([]);
});

test("handles an empty list", () => {
    expect(trimTo([], 3)).toEqual([]);
});

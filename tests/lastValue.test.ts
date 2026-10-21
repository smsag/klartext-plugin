import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_MS, lastValue } from "../src/lastValue";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("lastValue", () => {
  it("computes once for the same key during a burst", () => {
    const compute = vi.fn((s: string) => s.length);
    const last = lastValue(compute);
    expect(last.get("abc")).toBe(3);
    expect(last.get("abc")).toBe(3);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("computes again for another key", () => {
    const compute = vi.fn((s: string) => s.length);
    const last = lastValue(compute);
    last.get("abc");
    expect(last.get("abcd")).toBe(4);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("lets the value go once the burst is over, so a closed note's text is not kept", () => {
    const compute = vi.fn((s: string) => s.length);
    const last = lastValue(compute);
    last.get("abc");
    vi.advanceTimersByTime(RELEASE_MS - 1);
    last.get("abc"); // still held, and the wait starts again
    vi.advanceTimersByTime(RELEASE_MS - 1);
    expect(compute).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    last.get("abc");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("lets the value go at once on release", () => {
    const compute = vi.fn((s: string) => s.length);
    const last = lastValue(compute);
    last.get("abc");
    last.release();
    last.get("abc");
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

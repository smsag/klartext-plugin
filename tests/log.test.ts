import { afterEach, describe, expect, it, vi } from "vitest";
import { PREFIX, guarded, resetLog, warnOnce } from "../src/log";

afterEach(() => {
  resetLog();
  vi.restoreAllMocks();
});

describe("warnOnce", () => {
  it("logs a failure once, with the prefix, and stays quiet when it repeats", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOnce("the poll", new Error("gone"));
    warnOnce("the poll", new Error("gone"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain(PREFIX);
    expect(warn.mock.calls[0]![0]).toContain("the poll");
  });

  it("logs a failure somewhere else again, but not the same place with another message", () => {
    // Keyed on the message, a failure naming a changing position logged on
    // every poll and grew the set without end.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOnce("the poll", new Error("at 1"));
    warnOnce("the poll", new Error("at 2"));
    warnOnce("a table", new Error("at 1"));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("says a plain message without an error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOnce("the top row stays as it is: no Electron");
    expect(warn).toHaveBeenCalledWith(`${PREFIX} the top row stays as it is: no Electron`);
  });

  it("forgets what it logged once the log is reset, as on a reload", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOnce("x", new Error("y"));
    resetLog();
    warnOnce("x", new Error("y"));
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("guarded", () => {
  it("passes a promise on, and logs its rejection instead of leaving it unhandled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = guarded("an async job", async (n: number) => n * 2);
    await expect(ok(2)).resolves.toBe(4);
    const bad = guarded("an async table", async () => {
      throw new Error("late");
    });
    await expect(bad()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("runs the function with its arguments, and logs a throw instead of passing it on", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: number[] = [];
    const ok = guarded("adding", (a: number, b: number) => void seen.push(a + b));
    ok(1, 2);
    expect(seen).toEqual([3]);
    const bad = guarded("a table", () => {
      throw new Error("bad row");
    });
    expect(() => bad()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

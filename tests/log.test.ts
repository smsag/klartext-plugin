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

  it("logs a different failure, or the same one somewhere else, again", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOnce("the poll", new Error("gone"));
    warnOnce("the poll", new Error("other"));
    warnOnce("a table", new Error("gone"));
    expect(warn).toHaveBeenCalledTimes(3);
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

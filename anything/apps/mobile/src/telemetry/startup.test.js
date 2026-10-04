import { reportStartup, __resetStartupForTests } from "./startup";
import { track } from "./track";

jest.mock("./track", () => ({ track: jest.fn() }));
jest.mock("../../__create/boot-trace", () => ({ getBootElapsedMs: jest.fn() }));

const bootTrace = require("../../__create/boot-trace");

beforeEach(() => {
  jest.clearAllMocks();
  __resetStartupForTests();
});

describe("reportStartup (perf_startup from the boot trace)", () => {
  it("emits perf_startup with the bucketed boot time, once per launch", () => {
    bootTrace.getBootElapsedMs.mockReturnValue(2400);
    reportStartup();
    reportStartup();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("perf_startup", { ms_bucket: "lt3000" });
  });

  it("emits nothing while the boot is not complete (null) or the time is unusable", () => {
    bootTrace.getBootElapsedMs.mockReturnValue(null);
    reportStartup();
    bootTrace.getBootElapsedMs.mockReturnValue(Number.NaN);
    reportStartup();
    expect(track).not.toHaveBeenCalled();
  });

  it("never throws when the boot trace misbehaves", () => {
    bootTrace.getBootElapsedMs.mockImplementation(() => {
      throw new Error("trace broke");
    });
    expect(() => reportStartup()).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});

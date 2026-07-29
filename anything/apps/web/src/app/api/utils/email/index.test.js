import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The transactional-email seam. The contract that matters: sendEmail NEVER throws, so an
// unconfigured or broken vendor can never turn a working user action into a 500 (the
// dormant-behind-keys pattern used by VIDEO_API_KEY / CRON_SECRET / the payments keys).

import { sendEmail, emailConfig } from "./index";

const SAVED = {
  key: process.env.EMAIL_API_KEY,
  from: process.env.EMAIL_FROM,
  provider: process.env.EMAIL_PROVIDER,
  base: process.env.EMAIL_API_BASE_URL,
};

const MESSAGE = {
  to: "owner@example.com",
  subject: "Reset your PawPi password",
  text: "https://pawpi.app/account/reset-password?token=secret-token",
  html: "<a>link</a>",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.EMAIL_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_BASE_URL;
});

afterEach(() => {
  for (const [name, value] of [
    ["EMAIL_API_KEY", SAVED.key],
    ["EMAIL_FROM", SAVED.from],
    ["EMAIL_PROVIDER", SAVED.provider],
    ["EMAIL_API_BASE_URL", SAVED.base],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("emailConfig", () => {
  it("is null until EMAIL_API_KEY is set (the feature is dormant, not broken)", () => {
    expect(emailConfig()).toBeNull();
  });

  it("defaults the provider, sender and base URL once the key is set", () => {
    process.env.EMAIL_API_KEY = "re_test";
    expect(emailConfig()).toEqual({
      provider: "resend",
      apiKey: "re_test",
      from: "PawPi <no-reply@pawpi.app>",
      baseUrl: "https://api.resend.com",
    });
  });

  it("honours the overrides", () => {
    process.env.EMAIL_API_KEY = "re_test";
    process.env.EMAIL_FROM = "PawPi <hi@pawpi.app>";
    process.env.EMAIL_API_BASE_URL = "https://api.example.test";
    const cfg = emailConfig();
    expect(cfg.from).toBe("PawPi <hi@pawpi.app>");
    expect(cfg.baseUrl).toBe("https://api.example.test");
  });

  it("is read at CALL time, not import time (so a late-set key takes effect)", () => {
    expect(emailConfig()).toBeNull();
    process.env.EMAIL_API_KEY = "re_late";
    expect(emailConfig()?.apiKey).toBe("re_late");
  });
});

describe("sendEmail — degrade clean with no key", () => {
  it("does not send, does not throw, and reports not_configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      sent: false,
      reason: "not_configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("logs the INTENDED send server-side so the flow stays traceable pre-go-live", async () => {
    await sendEmail(MESSAGE);
    const line = console.log.mock.calls[0][0];
    expect(line).toContain("EMAIL_API_KEY not set");
    expect(line).toContain("owner@example.com");
    expect(line).toContain("Reset your PawPi password");
  });

  // Logs are not a secret store: a reset token in the server log is a reset token an attacker
  // with log access can redeem.
  it("NEVER logs the message body (it carries the reset token)", async () => {
    await sendEmail(MESSAGE);
    const logged = console.log.mock.calls.flat().join(" ");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("reset-password?token");
  });
});

describe("sendEmail — configured", () => {
  beforeEach(() => {
    process.env.EMAIL_API_KEY = "re_test";
  });

  it("POSTs the message to the vendor and returns the message id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }),
    );

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      sent: true,
      id: "msg_123",
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.from).toBe("PawPi <no-reply@pawpi.app>");
    expect(body.subject).toBe(MESSAGE.subject);
    expect(body.text).toBe(MESSAGE.text);
    expect(body.html).toBe(MESSAGE.html);
  });

  it("omits text/html keys that weren't supplied", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail({ to: "a@b.c", subject: "s", text: "t" });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("html");
    expect(body.text).toBe("t");
  });

  it("a vendor rejection is reported, not thrown", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("domain not verified", { status: 422 }),
    );
    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      sent: false,
      reason: "send_failed",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("a network failure is reported, not thrown", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      sent: false,
      reason: "send_failed",
    });
  });

  it("an unknown EMAIL_PROVIDER sends nothing rather than guessing", async () => {
    process.env.EMAIL_PROVIDER = "carrier-pigeon";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      sent: false,
      reason: "unknown_provider",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("tolerates a success response with no JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );
    await expect(sendEmail(MESSAGE)).resolves.toEqual({ sent: true, id: null });
  });
});

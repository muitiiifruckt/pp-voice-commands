import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMe,
  getToken,
  listRecords,
  login,
  setToken,
} from "./api";

describe("api token helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("setToken and getToken round-trip", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");
  });

  it("setToken(null) clears storage", () => {
    setToken("x");
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

describe("login", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("stores access_token on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-1" }), { status: 200 })
    );
    await login("u", "p");
    expect(getToken()).toBe("tok-1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );
    const body = vi.mocked(fetch).mock.calls[0][1]?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get("username")).toBe("u");
    expect((body as URLSearchParams).get("password")).toBe("p");
  });

  it("throws on bad credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "bad" }), { status: 401 })
    );
    await expect(login("u", "p")).rejects.toThrow();
    expect(getToken()).toBeNull();
  });
});

describe("listRecords query", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken("t");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("builds query string from filters", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await listRecords({
      command: "зарегистрировать",
      identifier: "р1",
      date_from: "2025-01-01",
      date_to: "2025-01-31",
      operator_id: 3,
    });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain("command=");
    expect(url).toContain("identifier=");
    expect(url).toContain("date_from=");
    expect(url).toContain("date_to=");
    expect(url).toContain("operator_id=3");
  });
});

describe("fetchMe", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken("expired");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("clears token on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 401 }));
    await expect(fetchMe()).rejects.toThrow(/сессия/i);
    expect(getToken()).toBeNull();
  });
});

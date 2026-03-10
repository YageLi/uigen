// @vitest-environment node
import { vi, test, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";

// Must be mocked before importing auth.ts — "server-only" throws in jsdom
vi.mock("server-only", () => ({}));

const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
}));

// Must be imported after vi.mock() calls are hoisted
const { getSession } = await import("@/lib/auth");

// Same secret the module uses when JWT_SECRET env var is absent
const TEST_SECRET = new TextEncoder().encode("development-secret-key");
const WRONG_SECRET = new TextEncoder().encode("wrong-secret-key");

async function mintToken(
  payload: Record<string, unknown>,
  options: { secret?: Uint8Array; expiresIn?: string } = {}
): Promise<string> {
  const { secret = TEST_SECRET, expiresIn = "7d" } = options;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

function setCookie(value: string | undefined) {
  mockCookieGet.mockReturnValue(value !== undefined ? { value } : undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// No cookie / missing token
// ---------------------------------------------------------------------------

test("returns null when auth-token cookie is absent", async () => {
  mockCookieGet.mockReturnValue(undefined);
  expect(await getSession()).toBeNull();
});

test("returns null when cookie value is an empty string", async () => {
  setCookie("");
  expect(await getSession()).toBeNull();
});

// ---------------------------------------------------------------------------
// Valid token
// ---------------------------------------------------------------------------

test("returns SessionPayload for a valid token", async () => {
  const token = await mintToken({ userId: "u1", email: "alice@example.com", expiresAt: new Date() });
  setCookie(token);

  const session = await getSession();

  expect(session).not.toBeNull();
  expect(session?.userId).toBe("u1");
  expect(session?.email).toBe("alice@example.com");
});

test("returns the exact userId and email embedded in the token", async () => {
  const token = await mintToken({
    userId: "user-abc-123",
    email: "bob@test.org",
    expiresAt: new Date(),
  });
  setCookie(token);

  const session = await getSession();

  expect(session?.userId).toBe("user-abc-123");
  expect(session?.email).toBe("bob@test.org");
});

// ---------------------------------------------------------------------------
// Expired / future-dated tokens
// ---------------------------------------------------------------------------

test("returns null for an expired token", async () => {
  // Set expiry to 1 second in the past
  const token = await mintToken(
    { userId: "u1", email: "alice@example.com", expiresAt: new Date() },
    { expiresIn: "1s" }
  );

  // Wait for it to expire
  await new Promise((r) => setTimeout(r, 1100));

  setCookie(token);
  expect(await getSession()).toBeNull();
});

// ---------------------------------------------------------------------------
// Tampered / invalid tokens
// ---------------------------------------------------------------------------

test("returns null for a malformed token string", async () => {
  setCookie("this.is.not.a.jwt");
  expect(await getSession()).toBeNull();
});

test("returns null for a completely garbage cookie value", async () => {
  setCookie("hunter2");
  expect(await getSession()).toBeNull();
});

test("returns null for a token signed with the wrong secret", async () => {
  const token = await mintToken(
    { userId: "u1", email: "alice@example.com", expiresAt: new Date() },
    { secret: WRONG_SECRET }
  );
  setCookie(token);
  expect(await getSession()).toBeNull();
});

test("returns null for a structurally valid JWT with a tampered payload", async () => {
  const token = await mintToken({ userId: "u1", email: "alice@example.com", expiresAt: new Date() });
  // Flip one character in the signature segment
  const parts = token.split(".");
  const tamperedSig = parts[2].slice(0, -1) + (parts[2].slice(-1) === "a" ? "b" : "a");
  setCookie([parts[0], parts[1], tamperedSig].join("."));
  expect(await getSession()).toBeNull();
});

// ---------------------------------------------------------------------------
// Cookie name specificity
// ---------------------------------------------------------------------------

test("only reads the auth-token cookie, not others", async () => {
  // Simulate get() returning undefined for auth-token (other cookies exist but this one doesn't)
  mockCookieGet.mockImplementation((name: string) =>
    name === "auth-token" ? undefined : { value: "some-other-token" }
  );

  expect(await getSession()).toBeNull();
  expect(mockCookieGet).toHaveBeenCalledWith("auth-token");
});

test("calls cookies().get() exactly once per invocation", async () => {
  mockCookieGet.mockReturnValue(undefined);
  await getSession();
  expect(mockCookieGet).toHaveBeenCalledTimes(1);
});

import { vi, test, expect, beforeEach, describe } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AuthResult } from "@/actions";

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module under test is imported
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignInAction = vi.fn();
const mockSignUpAction = vi.fn();
vi.mock("@/actions", () => ({
  signIn: (email: string, password: string) => mockSignInAction(email, password),
  signUp: (email: string, password: string) => mockSignUpAction(email, password),
}));

const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

const mockGetProjects = vi.fn();
vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));

const mockCreateProject = vi.fn();
vi.mock("@/actions/create-project", () => ({
  createProject: (input: unknown) => mockCreateProject(input),
}));

const { useAuth } = await import("@/hooks/use-auth");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUCCESS: AuthResult = { success: true };
const FAILURE: AuthResult = { success: false, error: "Invalid credentials" };

function noAnonWork() {
  mockGetAnonWorkData.mockReturnValue(null);
}

function anonWorkWith(messages: unknown[], fileSystemData = {}) {
  mockGetAnonWorkData.mockReturnValue({ messages, fileSystemData });
}

function existingProjects(...ids: string[]) {
  mockGetProjects.mockResolvedValue(ids.map((id) => ({ id, name: "Project" })));
}

function noProjects() {
  mockGetProjects.mockResolvedValue([]);
}

function createdProject(id: string) {
  mockCreateProject.mockResolvedValue({ id, name: "Project" });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSignInAction.mockResolvedValue(SUCCESS);
  mockSignUpAction.mockResolvedValue(SUCCESS);
  noAnonWork();
  noProjects();
  createdProject("new-proj-1");
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

test("isLoading starts as false", () => {
  const { result } = renderHook(() => useAuth());
  expect(result.current.isLoading).toBe(false);
});

test("exposes signIn, signUp, and isLoading", () => {
  const { result } = renderHook(() => useAuth());
  expect(typeof result.current.signIn).toBe("function");
  expect(typeof result.current.signUp).toBe("function");
  expect(typeof result.current.isLoading).toBe("boolean");
});

// ---------------------------------------------------------------------------
// signIn — loading state
// ---------------------------------------------------------------------------

describe("signIn — isLoading", () => {
  test("is true while the action is in-flight, false afterward", async () => {
    let resolveAction!: (v: AuthResult) => void;
    mockSignInAction.mockReturnValue(new Promise((r) => (resolveAction = r)));

    const { result } = renderHook(() => useAuth());

    // Fire sign-in but don't await it yet
    let signInPromise: Promise<AuthResult>;
    act(() => {
      signInPromise = result.current.signIn("a@b.com", "password1");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveAction({ success: false, error: "fail" });
      await signInPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when the action throws", async () => {
    mockSignInAction.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false when handlePostSignIn throws", async () => {
    // signIn succeeds but getProjects throws (e.g. network failure after auth)
    mockGetProjects.mockRejectedValue(new Error("db error"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signIn — credential forwarding
// ---------------------------------------------------------------------------

test("signIn forwards email and password to the action", async () => {
  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("alice@example.com", "s3cr3tpassword");
  });

  expect(mockSignInAction).toHaveBeenCalledWith("alice@example.com", "s3cr3tpassword");
});

test("signUp forwards email and password to the action", async () => {
  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp("bob@example.com", "mypassword1");
  });

  expect(mockSignUpAction).toHaveBeenCalledWith("bob@example.com", "mypassword1");
});

// ---------------------------------------------------------------------------
// signIn — failed auth (no navigation)
// ---------------------------------------------------------------------------

describe("signIn — failed auth", () => {
  test("returns the failure result from the action", async () => {
    mockSignInAction.mockResolvedValue(FAILURE);

    const { result } = renderHook(() => useAuth());
    let returnValue: AuthResult | undefined;

    await act(async () => {
      returnValue = await result.current.signIn("a@b.com", "wrong");
    });

    expect(returnValue).toEqual(FAILURE);
  });

  test("does not navigate when sign-in fails", async () => {
    mockSignInAction.mockResolvedValue(FAILURE);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "wrong");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("does not call getProjects or createProject when sign-in fails", async () => {
    mockSignInAction.mockResolvedValue(FAILURE);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "wrong");
    });

    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signIn — post-sign-in routing: anon work
// ---------------------------------------------------------------------------

describe("signIn — post-sign-in with anonymous work", () => {
  const anonMessages = [{ role: "user", content: "Hello" }];
  const anonFs = { "/App.jsx": "export default () => <div/>" };

  beforeEach(() => {
    anonWorkWith(anonMessages, anonFs);
    createdProject("anon-project-99");
  });

  test("creates a project from the anon work data", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: anonMessages,
        data: anonFs,
      })
    );
  });

  test("navigates to the newly created project", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockPush).toHaveBeenCalledWith("/anon-project-99");
  });

  test("clears anon work after saving it", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockClearAnonWork).toHaveBeenCalledTimes(1);
  });

  test("does not call getProjects when anon work exists", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockGetProjects).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signIn — post-sign-in routing: anon work with empty messages
// ---------------------------------------------------------------------------

test("treats anon work with empty messages as no anon work", async () => {
  anonWorkWith([]); // has anon data but zero messages
  existingProjects("existing-proj-1");

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("a@b.com", "password1");
  });

  // Should fall through to getProjects, not createProject from anon data
  expect(mockGetProjects).toHaveBeenCalled();
  expect(mockClearAnonWork).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/existing-proj-1");
});

// ---------------------------------------------------------------------------
// signIn — post-sign-in routing: existing projects
// ---------------------------------------------------------------------------

describe("signIn — post-sign-in with existing projects", () => {
  beforeEach(() => {
    noAnonWork();
    existingProjects("proj-a", "proj-b", "proj-c");
  });

  test("navigates to the first (most recent) project", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-a");
  });

  test("does not create a new project when one already exists", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// signIn — post-sign-in routing: no projects
// ---------------------------------------------------------------------------

describe("signIn — post-sign-in with no existing projects", () => {
  beforeEach(() => {
    noAnonWork();
    noProjects();
    createdProject("brand-new-proj");
  });

  test("creates a new empty project", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
  });

  test("navigates to the newly created project", async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "password1");
    });

    expect(mockPush).toHaveBeenCalledWith("/brand-new-proj");
  });
});

// ---------------------------------------------------------------------------
// signUp — mirrors signIn routing logic
// ---------------------------------------------------------------------------

describe("signUp", () => {
  test("returns the success result from the action", async () => {
    const { result } = renderHook(() => useAuth());
    let returnValue: AuthResult | undefined;

    await act(async () => {
      returnValue = await result.current.signUp("a@b.com", "pass1234");
    });

    expect(returnValue).toEqual(SUCCESS);
  });

  test("returns the failure result and does not navigate", async () => {
    mockSignUpAction.mockResolvedValue(FAILURE);

    const { result } = renderHook(() => useAuth());
    let returnValue: AuthResult | undefined;

    await act(async () => {
      returnValue = await result.current.signUp("a@b.com", "pass1234");
    });

    expect(returnValue).toEqual(FAILURE);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("runs the same post-sign-in routing as signIn", async () => {
    // Spot-check: signUp with anon work navigates to the anon project,
    // confirming both functions share the same handlePostSignIn logic.
    anonWorkWith([{ role: "user", content: "Hello" }]);
    createdProject("signup-anon-proj");

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("new@user.com", "password1");
    });

    expect(mockPush).toHaveBeenCalledWith("/signup-anon-proj");
    expect(mockClearAnonWork).toHaveBeenCalledTimes(1);
  });
});

describe("signUp — isLoading", () => {
  test("is true during sign-up, false afterward", async () => {
    let resolveAction!: (v: AuthResult) => void;
    mockSignUpAction.mockReturnValue(new Promise((r) => (resolveAction = r)));

    const { result } = renderHook(() => useAuth());

    let signUpPromise: Promise<AuthResult>;
    act(() => {
      signUpPromise = result.current.signUp("a@b.com", "password1");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveAction(FAILURE);
      await signUpPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });
});

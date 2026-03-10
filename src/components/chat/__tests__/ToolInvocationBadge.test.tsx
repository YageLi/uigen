import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getToolLabel, ToolInvocationBadge } from "../ToolInvocationBadge";
import type { ToolInvocation } from "ai";

afterEach(() => {
  cleanup();
});

// getToolLabel unit tests

test("str_replace_editor + create returns Creating path", () => {
  expect(getToolLabel("str_replace_editor", { command: "create", path: "/App.jsx" })).toBe("Creating /App.jsx");
});

test("str_replace_editor + str_replace returns Editing path", () => {
  expect(getToolLabel("str_replace_editor", { command: "str_replace", path: "/components/Card.tsx" })).toBe("Editing /components/Card.tsx");
});

test("str_replace_editor + insert returns Editing path", () => {
  expect(getToolLabel("str_replace_editor", { command: "insert", path: "/App.jsx" })).toBe("Editing /App.jsx");
});

test("str_replace_editor + view returns Viewing path", () => {
  expect(getToolLabel("str_replace_editor", { command: "view", path: "/App.jsx" })).toBe("Viewing /App.jsx");
});

test("str_replace_editor + undo_edit returns Undoing changes to path", () => {
  expect(getToolLabel("str_replace_editor", { command: "undo_edit", path: "/App.jsx" })).toBe("Undoing changes to /App.jsx");
});

test("str_replace_editor + unknown command with path falls back to Editing path", () => {
  expect(getToolLabel("str_replace_editor", { command: "unknown", path: "/App.jsx" })).toBe("Editing /App.jsx");
});

test("str_replace_editor + no path falls back to Editing file", () => {
  expect(getToolLabel("str_replace_editor", {})).toBe("Editing file");
});

test("file_manager + rename with new_path returns Renaming with arrow", () => {
  expect(getToolLabel("file_manager", { command: "rename", path: "/old.jsx", new_path: "/new.jsx" })).toBe("Renaming /old.jsx → /new.jsx");
});

test("file_manager + delete returns Deleting path", () => {
  expect(getToolLabel("file_manager", { command: "delete", path: "/App.jsx" })).toBe("Deleting /App.jsx");
});

test("unknown tool name returns the tool name as-is", () => {
  expect(getToolLabel("some_unknown_tool", { command: "foo" })).toBe("some_unknown_tool");
});

test("file_manager + no path falls back to Managing file", () => {
  expect(getToolLabel("file_manager", {})).toBe("Managing file");
});

test("file_manager + rename without new_path omits arrow", () => {
  expect(getToolLabel("file_manager", { command: "rename", path: "/old.jsx" })).toBe("Renaming /old.jsx");
});

// Component render tests

test("ToolInvocationBadge shows green dot when state is result", () => {
  const tool: ToolInvocation = {
    toolCallId: "1",
    toolName: "str_replace_editor",
    args: { command: "create", path: "/App.jsx" },
    state: "result",
    result: "Success",
  };

  const { container } = render(<ToolInvocationBadge toolInvocation={tool} />);
  const dot = container.querySelector(".bg-emerald-500");
  expect(dot).toBeDefined();
  expect(dot).not.toBeNull();
});

test("ToolInvocationBadge shows spinner when state is call", () => {
  const tool: ToolInvocation = {
    toolCallId: "2",
    toolName: "str_replace_editor",
    args: { command: "create", path: "/App.jsx" },
    state: "call",
  };

  const { container } = render(<ToolInvocationBadge toolInvocation={tool} />);
  const spinner = container.querySelector(".animate-spin");
  expect(spinner).toBeDefined();
  expect(spinner).not.toBeNull();
});

test("ToolInvocationBadge displays friendly label not raw tool name", () => {
  const tool: ToolInvocation = {
    toolCallId: "3",
    toolName: "str_replace_editor",
    args: { command: "create", path: "/App.jsx" },
    state: "result",
    result: "Success",
  };

  render(<ToolInvocationBadge toolInvocation={tool} />);
  expect(screen.getByText("Creating /App.jsx")).toBeDefined();
  expect(screen.queryByText("str_replace_editor")).toBeNull();
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let mockPathname = "/learn";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: mockPathname } }),
}));

const { TopBar, BottomTabs, MobileFrame, LessonFrame } = await import("./AppShell");
const { useProgress } = await import("../lib/progress");

beforeEach(() => {
  mockPathname = "/learn";
  useProgress.getState().reset();
});

afterEach(() => {
  useProgress.getState().reset();
});

describe("TopBar", () => {
  it("shows placeholder stats before hydration", () => {
    useProgress.setState({ hydrated: false, xp: 999, streak: 999, hearts: 999 });
    render(<TopBar />);
    expect(screen.getByLabelText("Streak")).toHaveTextContent("0");
    expect(screen.getByLabelText("XP")).toHaveTextContent("0");
    expect(screen.getByLabelText("Hearts")).toHaveTextContent("5");
  });

  it("shows real stats once hydrated", () => {
    useProgress.setState({ hydrated: true, xp: 120, streak: 4, hearts: 3 });
    render(<TopBar />);
    expect(screen.getByLabelText("Streak")).toHaveTextContent("4");
    expect(screen.getByLabelText("XP")).toHaveTextContent("120");
    expect(screen.getByLabelText("Hearts")).toHaveTextContent("3");
  });

  it("announces a stat change to screen readers after hydration", () => {
    useProgress.setState({ hydrated: true, xp: 100, streak: 1, hearts: 5 });
    const { rerender } = render(<TopBar />);
    useProgress.setState({ xp: 150 });
    rerender(<TopBar />);
    expect(screen.getByRole("status")).toHaveTextContent("+50 XP");
  });
});

describe("BottomTabs", () => {
  it("marks the tab matching the current route as active", () => {
    mockPathname = "/league";
    render(<BottomTabs />);
    expect(screen.getByLabelText("League").firstElementChild).toHaveClass("text-moss");
    expect(screen.getByLabelText("Learn").firstElementChild).not.toHaveClass("text-moss");
  });

  it("treats nested paths as active via startsWith", () => {
    mockPathname = "/converse/coffee";
    render(<BottomTabs />);
    expect(screen.getByLabelText("Chat").firstElementChild).toHaveClass("text-moss");
  });
});

describe("MobileFrame / LessonFrame", () => {
  it("MobileFrame renders the top bar, children, and bottom tabs", () => {
    render(
      <MobileFrame>
        <p>Page content</p>
      </MobileFrame>,
    );
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("LessonFrame renders only its children, no chrome", () => {
    render(
      <LessonFrame>
        <p>Lesson content</p>
      </LessonFrame>,
    );
    expect(screen.getByText("Lesson content")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

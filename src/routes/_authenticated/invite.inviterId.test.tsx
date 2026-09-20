// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
let mockInviterId = "inviter-1";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => navigate,
    useParams: () => ({ inviterId: mockInviterId }),
  };
});

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const getInviterProfile = vi.fn();
const acceptFriendInvite = vi.fn();
vi.mock("../../lib/friends.functions", () => ({ getInviterProfile, acceptFriendInvite }));

const getMyProfile = vi.fn();
vi.mock("../../lib/leaderboard.functions", () => ({ getMyProfile }));

const { Route } = await import("./invite.$inviterId");

beforeEach(() => {
  navigate.mockClear();
  mockInviterId = "inviter-1";
  getInviterProfile.mockReset();
  acceptFriendInvite.mockReset();
  getMyProfile.mockReset();
});

describe("Invite route", () => {
  it("shows a loading state, then asks to confirm adding the inviter", async () => {
    getInviterProfile.mockResolvedValue({ displayName: "Ada", avatarSeed: "1" });
    getMyProfile.mockResolvedValue({ id: "me" });
    const InvitePage = Route.options.component!;
    render(<InvitePage />);
    expect(screen.getByText("Loading invite…")).toBeInTheDocument();
    expect(await screen.findByText("Add Ada as a friend?")).toBeInTheDocument();
  });

  it("shows the self-invite message when the inviter is the current user", async () => {
    getInviterProfile.mockResolvedValue({ displayName: "Me", avatarSeed: "1" });
    getMyProfile.mockResolvedValue({ id: "inviter-1" });
    const InvitePage = Route.options.component!;
    render(<InvitePage />);
    expect(await screen.findByText("That's your own invite link")).toBeInTheDocument();
  });

  it("shows a not-found message when the inviter doesn't exist", async () => {
    getInviterProfile.mockResolvedValue(null);
    getMyProfile.mockResolvedValue({ id: "me" });
    const InvitePage = Route.options.component!;
    render(<InvitePage />);
    expect(await screen.findByText("Invite not found")).toBeInTheDocument();
  });

  it("accepts the invite and shows success", async () => {
    getInviterProfile.mockResolvedValue({ displayName: "Ada", avatarSeed: "1" });
    getMyProfile.mockResolvedValue({ id: "me" });
    acceptFriendInvite.mockResolvedValue({ ok: true, message: "added" });
    const user = userEvent.setup();
    const InvitePage = Route.options.component!;
    render(<InvitePage />);
    await user.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(await screen.findByText("You're friends!")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "See your friends" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/profile/friends" });
  });

  it("shows an error state when accepting fails", async () => {
    getInviterProfile.mockResolvedValue({ displayName: "Ada", avatarSeed: "1" });
    getMyProfile.mockResolvedValue({ id: "me" });
    acceptFriendInvite.mockResolvedValue({ ok: false, message: "already friends" });
    const user = userEvent.setup();
    const InvitePage = Route.options.component!;
    render(<InvitePage />);
    await user.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("treats a rejected accept call as an error too", async () => {
    getInviterProfile.mockResolvedValue({ displayName: "Ada", avatarSeed: "1" });
    getMyProfile.mockResolvedValue({ id: "me" });
    acceptFriendInvite.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    const InvitePage = Route.options.component!;
    render(<InvitePage />);
    await user.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { verifyInstallationOwner } from "../lib/github/installation-access";

const personal = { id: 42, login: "owner", type: "User" };
const org = { id: 100, login: "team", type: "Organization" };
function identity(id: number, role = "member", state = "active") {
  return { currentUser: vi.fn(async () => ({ id })), organizationMembership: vi.fn(async () => ({ role, state })) };
}
describe("installation authorization", () => {
  it("allows the authenticated personal owner", async () => {
    const reader = identity(42);
    await expect(verifyInstallationOwner(personal, reader)).resolves.toBeUndefined();
    expect(reader.organizationMembership).not.toHaveBeenCalled();
  });
  it("rejects another user's installation even if its ID is known", async () => {
    await expect(verifyInstallationOwner(personal, identity(7))).rejects.toThrow();
  });
  it("allows an active organization owner", async () => {
    const reader = identity(7, "admin");
    await expect(verifyInstallationOwner(org, reader)).resolves.toBeUndefined();
    expect(reader.organizationMembership).toHaveBeenCalledWith("team");
  });
  it.each([["member", "active"], ["admin", "pending"]])("rejects role %s with state %s", async (role, state) => {
    await expect(verifyInstallationOwner(org, identity(7, role, state))).rejects.toThrow();
  });
  it("fails closed when GitHub identity cannot be verified", async () => {
    const reader = identity(42);
    reader.currentUser.mockRejectedValue(new Error("token revoked"));
    await expect(verifyInstallationOwner(personal, reader)).rejects.toThrow("token revoked");
  });
});

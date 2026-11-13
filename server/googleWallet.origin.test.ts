import { describe, expect, it } from "vitest";
import { GoogleWalletError, resolveGoogleWalletRequestOrigin } from "./googleWallet";

describe("resolveGoogleWalletRequestOrigin", () => {
  it("uses the browser Origin header when it matches the Referer origin", () => {
    expect(resolveGoogleWalletRequestOrigin("https://dietcoach.example", "https://dietcoach.example/member/secret-token"))
      .toBe("https://dietcoach.example");
  });

  it("can derive the page origin from a secure Referer when Origin is omitted", () => {
    expect(resolveGoogleWalletRequestOrigin(undefined, "https://dietcoach.example/member/secret-token"))
      .toBe("https://dietcoach.example");
  });

  it("rejects caller-supplied origins that disagree with browser Referer metadata", () => {
    expect(() => resolveGoogleWalletRequestOrigin("https://attacker.example", "https://dietcoach.example/member/token"))
      .toThrowError(GoogleWalletError);
  });

  it("rejects missing, opaque, or insecure external origins", () => {
    expect(() => resolveGoogleWalletRequestOrigin()).toThrowError(GoogleWalletError);
    expect(() => resolveGoogleWalletRequestOrigin("null")).toThrowError(GoogleWalletError);
    expect(() => resolveGoogleWalletRequestOrigin("http://dietcoach.example")).toThrowError(GoogleWalletError);
  });

  it("allows local HTTP origins for development only", () => {
    expect(resolveGoogleWalletRequestOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

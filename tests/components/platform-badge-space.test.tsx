// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PlatformBadgeSpace, badgeHeight } from "@/components/layout/platform-badge-space";

afterEach(() => {
  cleanup();
  document.getElementById("nl-badge-frame")?.remove();
});

function addBadge(height: number) {
  const frame = document.createElement("iframe");
  frame.id = "nl-badge-frame";
  frame.getBoundingClientRect = () => ({ height, width: 197, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(frame);
  return frame;
}

const space = () => document.documentElement.style.getPropertyValue("--badge-space");

describe("room for Netlify's badge", () => {
  it("is 0 with no badge (local development, other hosts)", () => {
    expect(badgeHeight(document)).toBe(0);
    render(<PlatformBadgeSpace />);
    expect(space()).toBe("0px");
  });

  it("follows the badge when Netlify adds it after the page loads, and when it goes away", async () => {
    render(<PlatformBadgeSpace />);
    let frame!: HTMLIFrameElement;
    await act(async () => {
      frame = addBadge(64);
      await new Promise((r) => setTimeout(r, 0)); // let the MutationObserver run
    });
    expect(space()).toBe("64px");
    await act(async () => {
      frame.remove();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(space()).toBe("0px");
  });

  it("a hidden badge takes no room", () => {
    addBadge(64).style.display = "none";
    expect(badgeHeight(document)).toBe(0);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveBlobAsFile } from "./download-file";

describe("saveBlobAsFile (the data export's download)", () => {
  const createObjectURL = vi.fn(() => "blob:export");
  const revokeObjectURL = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicks an anchor that is in the document, and revokes the URL only after the click has been handled", () => {
    let attachedAtClick = false;
    let revokedAtClick = true;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      attachedAtClick = document.body.contains(this);
      revokedAtClick = revokeObjectURL.mock.calls.length > 0;
      expect(this.download).toBe("alphonso-my-data.json");
      expect(this.href).toBe("blob:export");
    });

    saveBlobAsFile(new Blob(["{}"], { type: "application/json" }), "alphonso-my-data.json");

    // Safari needs both: an attached anchor, and a URL still alive when the click lands.
    expect(attachedAtClick).toBe(true);
    expect(revokedAtClick).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
    // And nothing is left behind in the page.
    expect(document.querySelector("a[download]")).toBeNull();
  });
});

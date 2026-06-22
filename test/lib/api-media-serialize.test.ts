import { describe, expect, test } from "bun:test";
import { toMediaJson } from "../../src/lib/api/serialize";

const asset = { url: "/uploads/u-cat.png", filename: "u-cat.png", size: 1234 };

describe("toMediaJson", () => {
  test("full meta includes alt + caption", () => {
    expect(toMediaJson(asset, { alt: "A cat", caption: "My cat" })).toEqual({
      url: "/uploads/u-cat.png",
      filename: "u-cat.png",
      size: 1234,
      alt: "A cat",
      caption: "My cat",
    });
  });
  test("partial meta omits caption key", () => {
    const out = toMediaJson(asset, { alt: "A cat" });
    expect(out).toEqual({ url: "/uploads/u-cat.png", filename: "u-cat.png", size: 1234, alt: "A cat" });
    expect("caption" in out).toBe(false);
  });
  test("empty meta omits both alt and caption", () => {
    const out = toMediaJson(asset, {});
    expect(out).toEqual({ url: "/uploads/u-cat.png", filename: "u-cat.png", size: 1234 });
    expect("alt" in out).toBe(false);
    expect("caption" in out).toBe(false);
  });
});

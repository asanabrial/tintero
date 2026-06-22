import { describe, expect, test } from "bun:test";
import {
  sanitizeFilename,
  isAllowedExtension,
  isAllowedMimeType,
  isBelowSizeLimit,
  buildStoredFilename,
  buildPublicUrl,
  resolveUploadPath,
  MAX_BYTES,
} from "../../../src/lib/media/allowlist";
import * as path from "node:path";
import * as os from "node:os";

// ============================================================
// sanitizeFilename
// ============================================================
describe("sanitizeFilename", () => {
  test("uppercase and spaces converted: My Photo.JPG -> my-photo.jpg", () => {
    expect(sanitizeFilename("My Photo.JPG")).toBe("my-photo.jpg");
  });

  test("path traversal stripped: ../../etc/passwd.jpg -> passwd.jpg", () => {
    const result = sanitizeFilename("../../etc/passwd.jpg");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
    expect(result).not.toContain("..");
    // basename after stripping path separators should be safe
    expect(result).toBe("passwd.jpg");
  });

  test("leading dot stripped: .hidden.jpg -> hidden.jpg", () => {
    const result = sanitizeFilename(".hidden.jpg");
    expect(result).not.toMatch(/^\./);
    expect(result).toBe("hidden.jpg");
  });

  test("unicode/special chars replaced: héro_image (1).png -> collapsed variant with .png", () => {
    const result = sanitizeFilename("héro_image (1).png");
    // Must not contain non-[a-z0-9.-] characters
    expect(result).toMatch(/^[a-z0-9.\-]+$/);
    // Must end with .png
    expect(result).toMatch(/\.png$/);
    // Leading/trailing hyphens trimmed
    expect(result).not.toMatch(/^-/);
    expect(result).not.toMatch(/-$/);
  });

  test("consecutive special chars collapsed: a___b!!!c.png -> a-b-c.png", () => {
    expect(sanitizeFilename("a___b!!!c.png")).toBe("a-b-c.png");
  });

  test("pathological input with only slashes -> empty string", () => {
    const result = sanitizeFilename("///");
    expect(result).toBe("");
  });

  test("empty string -> empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });
});

// ============================================================
// isAllowedExtension
// ============================================================
describe("isAllowedExtension", () => {
  test(".png is allowed", () => {
    expect(isAllowedExtension(".png")).toBe(true);
  });

  test(".jpeg is allowed", () => {
    expect(isAllowedExtension(".jpeg")).toBe(true);
  });

  test(".webp is allowed", () => {
    expect(isAllowedExtension(".webp")).toBe(true);
  });

  test(".jpg is allowed", () => {
    expect(isAllowedExtension(".jpg")).toBe(true);
  });

  test(".gif is allowed", () => {
    expect(isAllowedExtension(".gif")).toBe(true);
  });

  test(".svg is NOT allowed", () => {
    expect(isAllowedExtension(".svg")).toBe(false);
  });

  test(".exe is NOT allowed", () => {
    expect(isAllowedExtension(".exe")).toBe(false);
  });

  test("empty string is NOT allowed", () => {
    expect(isAllowedExtension("")).toBe(false);
  });

  test(".PNG uppercase is allowed (lowercased internally)", () => {
    expect(isAllowedExtension(".PNG")).toBe(true);
  });
});

// ============================================================
// isAllowedMimeType
// ============================================================
describe("isAllowedMimeType", () => {
  test("image/png is allowed", () => {
    expect(isAllowedMimeType("image/png")).toBe(true);
  });

  test("image/jpeg is allowed", () => {
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
  });

  test("image/gif is allowed", () => {
    expect(isAllowedMimeType("image/gif")).toBe(true);
  });

  test("image/webp is allowed", () => {
    expect(isAllowedMimeType("image/webp")).toBe(true);
  });

  test("image/svg+xml is NOT allowed", () => {
    expect(isAllowedMimeType("image/svg+xml")).toBe(false);
  });

  test("text/html is NOT allowed", () => {
    expect(isAllowedMimeType("text/html")).toBe(false);
  });

  test("empty string is NOT allowed", () => {
    expect(isAllowedMimeType("")).toBe(false);
  });
});

// ============================================================
// isBelowSizeLimit
// ============================================================
describe("isBelowSizeLimit", () => {
  test("exactly MAX_BYTES is accepted (<=, not strictly less)", () => {
    expect(isBelowSizeLimit(MAX_BYTES)).toBe(true);
  });

  test("MAX_BYTES + 1 is rejected (strictly greater)", () => {
    expect(isBelowSizeLimit(MAX_BYTES + 1)).toBe(false);
  });

  test("MAX_BYTES - 1 is accepted", () => {
    expect(isBelowSizeLimit(MAX_BYTES - 1)).toBe(true);
  });

  test("0 bytes is rejected (empty file)", () => {
    expect(isBelowSizeLimit(0)).toBe(false);
  });
});

// ============================================================
// buildStoredFilename
// ============================================================
describe("buildStoredFilename", () => {
  test("returns UUID-prefixed sanitized filename", () => {
    const result = buildStoredFilename("My Photo.jpg");
    // Must match UUID v4 prefix + hyphen + sanitized name
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-my-photo\.jpg$/
    );
  });

  test("prefix is valid UUID v4, tail is sanitized name", () => {
    const result = buildStoredFilename("My Photo.jpg");
    const uuidPart = result.slice(0, 36);
    const tail = result.slice(37); // skip UUID + '-'
    expect(uuidPart).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(tail).toBe("my-photo.jpg");
  });
});

// ============================================================
// buildPublicUrl
// ============================================================
describe("buildPublicUrl", () => {
  test("prepends /uploads/", () => {
    expect(buildPublicUrl("abc.png")).toBe("/uploads/abc.png");
  });

  test("works with UUID-prefixed filename", () => {
    const filename = "550e8400-e29b-41d4-a716-446655440000-photo.jpg";
    expect(buildPublicUrl(filename)).toBe(`/uploads/${filename}`);
  });
});

// ============================================================
// resolveUploadPath
// ============================================================
describe("resolveUploadPath", () => {
  const tmpDir = path.join(os.tmpdir(), "tintero-allowlist-test");

  test("valid filename inside dir returns ok:true with path inside dir", () => {
    const result = resolveUploadPath(tmpDir, "file.png");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path.startsWith(path.resolve(tmpDir) + path.sep)).toBe(true);
    }
  });

  test("path traversal ../escape.png returns ok:false with invalid_filename", () => {
    const result = resolveUploadPath(tmpDir, "../escape.png");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_filename");
    }
  });

  test("absolute path is rejected", () => {
    const result = resolveUploadPath(tmpDir, "/etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_filename");
    }
  });

  test("sub/../../escape is rejected", () => {
    const result = resolveUploadPath(tmpDir, "sub/../../escape");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_filename");
    }
  });
});

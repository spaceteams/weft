import { describe, expect, it } from "vitest";
import { fingerprintValue } from "./fingerprint";

/**
 * The `node:crypto` digests below are the reason the pure-JS hash is safe to
 * swap in.
 *
 * `node:crypto` was the previous implementation, so every fingerprint already
 * written into a frozen artifact stays verifiable: sha256 is sha256, and the
 * encoding is UTF-8 on both sides. If a refactor changes the digest — an
 * encoding change, a truncation, a different algorithm — the values stored in
 * old artifacts stop matching, and these tests are the only thing that notices.
 */
describe("fingerprintValue", () => {
  it("matches the sha256 digests node:crypto produced", () => {
    // canonicalize({ a: 1 }) is { a: 1 }; JSON.stringify gives '{"a":1}'.
    expect(fingerprintValue({ a: 1 })).toBe(
      "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
    );
    expect(fingerprintValue("")).toBe(
      "12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126",
    );
  });

  it("encodes non-ASCII as UTF-8, as node:crypto did", () => {
    // A latin1/ascii-only encoder would silently produce a different digest.
    expect(fingerprintValue("äöü")).toBe(
      "05e6cbe3b3f0c44c14b908b48cc2253819e69371493c92fc0ef3b08fc538fcdb",
    );
  });

  it("hashes inputs past a single block boundary", () => {
    // 1M 'a' exercises multi-block padding, where a chunking bug would show.
    expect(fingerprintValue("a".repeat(1_000_000))).toBe(
      "6baf4c35957b6d7bc3a54bde0e79851f81cab67232eee2b4b75be96fb2f5ccf4",
    );
  });

  it("returns a 64-character lowercase hex digest", () => {
    expect(fingerprintValue({ anything: [1, "two", null, true] })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is insensitive to key insertion order", () => {
    expect(fingerprintValue({ a: 1, b: 2 })).toBe(fingerprintValue({ b: 2, a: 1 }));
  });

  it("is sensitive to array element order", () => {
    expect(fingerprintValue({ list: [1, 2] })).not.toBe(fingerprintValue({ list: [2, 1] }));
  });

  it("distinguishes values that differ only in type", () => {
    expect(fingerprintValue(1)).not.toBe(fingerprintValue("1"));
  });

  it("distinguishes an absent key from a key holding null", () => {
    expect(fingerprintValue({ a: 1 })).not.toBe(fingerprintValue({ a: 1, b: null }));
  });

  it("is stable across repeated calls", () => {
    const value = { nested: { deep: [1, { x: "y" }] } };
    expect(fingerprintValue(value)).toBe(fingerprintValue(value));
  });
});

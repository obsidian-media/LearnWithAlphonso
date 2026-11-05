import { describe, expect, it } from "vitest";
import { askingMascotSize } from "./asking-alphonso";

const SHORT = "Which one means hello?";
const LONG = "Choose the sentence that correctly completes the dialogue between them"; // 70 chars
const size = (viewportHeight: number, prompt = SHORT, hasMedia = false) =>
  askingMascotSize({ viewportHeight, prompt, hasMedia });

describe("askingMascotSize", () => {
  it("steps by screen height: none under 600, small 600-799, large from 800", () => {
    expect(size(599)).toBeNull();
    expect(size(600)).toBe(56);
    expect(size(799)).toBe(56);
    expect(size(800)).toBe(136);
    expect(size(844)).toBe(136);
  });

  it("a prompt of exactly 60 characters is not long; 61 is", () => {
    expect(size(844, "x".repeat(60))).toBe(136);
    expect(size(844, "x".repeat(61))).toBe(56);
  });

  it("a long prompt caps him at the small avatar on a tall screen", () => {
    expect(size(844, LONG)).toBe(56);
  });

  it("an image, audio, listening or speak card caps him at the small avatar", () => {
    expect(size(844, SHORT, true)).toBe(56);
  });

  it("a long prompt on a media card removes him", () => {
    expect(size(844, LONG, true)).toBeNull();
    expect(size(667, LONG, true)).toBeNull();
  });

  it("a crowded card never makes him bigger on a short screen", () => {
    expect(size(550, SHORT, true)).toBeNull();
    expect(size(550, LONG)).toBeNull();
    expect(size(600, LONG)).toBe(56);
  });
});

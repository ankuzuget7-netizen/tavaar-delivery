import { describe, expect, it } from "vitest";
import { cityFromAddress } from "../server/db";

describe("public restaurant cities", () => {
  it("reads a city explicitly written before the street", () => {
    expect(cityFromAddress("Кызыл, ул. Ленина, 10")).toBe("Кызыл");
    expect(cityFromAddress("г. Ак-Довурак, дом 4")).toBe("Ак-Довурак");
  });

  it("does not invent a city from a street-only address", () => {
    expect(cityFromAddress("ул. Ленина, 10")).toBeNull();
    expect(cityFromAddress("")).toBeNull();
    expect(cityFromAddress(null)).toBeNull();
  });
});

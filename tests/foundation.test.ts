import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "@shared/contracts";
import {
  createRequirementSchema,
  memberSchema
} from "@shared/validation";
import { createSeedState } from "../src/main/seed";

describe("foundation contract", () => {
  it("defines one unique channel for each IPC operation", () => {
    const channels = Object.values(IPC_CHANNELS);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it("accepts only the two demo members", () => {
    expect(memberSchema.safeParse("member-a").success).toBe(true);
    expect(memberSchema.safeParse("member-b").success).toBe(true);
    expect(memberSchema.safeParse("member-c").success).toBe(false);
  });

  it("validates requirement input at the IPC boundary", () => {
    expect(
      createRequirementSchema.safeParse({
        actorId: "member-a",
        title: "库存汇总",
        content: "相同商品编号的库存记录需要合并。"
      }).success
    ).toBe(true);
  });
});

describe("seed snapshot", () => {
  it("provides two members and three initial requirements", () => {
    const snapshot = createSeedState();
    expect(snapshot.members).toHaveLength(2);
    expect(snapshot.requirements).toHaveLength(3);
    expect(
      snapshot.requirements.filter(
        (item) => item.status === "confirmed"
      )
    ).toHaveLength(2);
    expect(snapshot.plan).toBeNull();
  });
});

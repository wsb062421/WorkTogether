import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekPlanner } from "../src/main/services/planning/DeepSeekPlanner";
import { createSeedState } from "../src/main/seed";

const confirmedRequirements = createSeedState().requirements.filter(
  (requirement) => requirement.status === "confirmed"
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeepSeekPlanner", () => {
  it("uses a clearly labelled fallback when no API key is configured", async () => {
    const planner = new DeepSeekPlanner("", "https://example.invalid");
    const draft = await planner.generate(confirmedRequirements, {
      actorId: "member-a"
    });

    expect(draft.source).toBe("fallback");
    expect(draft.sourceLabel).toContain("离线备用计划");
    expect(draft.tasks.map((task) => task.demoAction)).toEqual([
      "inventory_summary",
      "discount_rule",
      "stock_validation"
    ]);
  });

  it("validates and normalizes a structured DeepSeek response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "依次完成库存汇总、折扣和库存校验。",
                tasks: [
                  {
                    demoAction: "inventory_summary",
                    title: "汇总库存",
                    description: "按商品编号汇总库存数量。",
                    acceptanceCriteria: ["同商品数量相加", "pytest 通过"]
                  },
                  {
                    demoAction: "discount_rule",
                    title: "应用折扣",
                    description: "订单达到门槛时应用九折。",
                    acceptanceCriteria: ["100 元订单应付 90 元"]
                  },
                  {
                    demoAction: "stock_validation",
                    title: "校验库存",
                    description: "库存不足时拒绝下单。",
                    acceptanceCriteria: ["库存不足返回错误"]
                  }
                ]
              })
            }
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const planner = new DeepSeekPlanner(
      "test-key",
      "https://api.example.test",
      "deepseek-test"
    );
    const draft = await planner.generate(confirmedRequirements, {
      actorId: "member-a"
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(draft.source).toBe("deepseek");
    expect(draft.sourceLabel).toContain("DeepSeek 实时生成");
    expect(draft.tasks).toHaveLength(3);
    expect(draft.tasks[0].title).toBe("汇总库存");
  });

  it("falls back when the model returns invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "not-json" } }]
        })
      })
    );

    const planner = new DeepSeekPlanner(
      "test-key",
      "https://api.example.test",
      "deepseek-test"
    );
    const draft = await planner.generate(confirmedRequirements, {
      actorId: "member-a"
    });

    expect(draft.source).toBe("fallback");
    expect(draft.sourceLabel).toContain("DeepSeek 调用失败");
  });
});

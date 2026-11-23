import { z } from "zod";
import type {
  DemoAction,
  MemberId,
  Requirement
} from "@shared/contracts";

const actionSchema = z.object({
  demoAction: z.enum([
    "inventory_summary",
    "discount_rule",
    "stock_validation"
  ]),
  title: z.string().min(2).max(100),
  description: z.string().min(5).max(1200),
  acceptanceCriteria: z.array(z.string().min(2).max(300)).min(1).max(4)
});

const responseSchema = z.object({
  summary: z.string().min(5).max(800),
  tasks: z.array(actionSchema).min(3).max(3)
});

export interface GeneratedPlanDraft {
  summary: string;
  source: "deepseek" | "fallback";
  sourceLabel: string;
  tasks: Array<{
    demoAction: DemoAction;
    title: string;
    description: string;
    acceptanceCriteria: string[];
  }>;
}

const fallbackTasks: GeneratedPlanTask[] = [
  {
    demoAction: "inventory_summary",
    title: "实现库存汇总",
    description:
      "读取库存记录，按商品编号累加数量，并输出可核对的汇总结果。",
    acceptanceCriteria: [
      "同一商品编号的多条记录只出现一次",
      "汇总数量等于原始记录数量之和",
      "相关 pytest 测试通过"
    ]
  },
  {
    demoAction: "discount_rule",
    title: "实现满额折扣",
    description:
      "计算订单原始金额，在达到门槛时应用九折优惠，并保留可核对的计算结果。",
    acceptanceCriteria: [
      "100 元订单的应付金额为 90 元",
      "99 元订单保持原价",
      "相关 pytest 测试通过"
    ]
  },
  {
    demoAction: "stock_validation",
    title: "增加库存校验",
    description:
      "在创建待交付订单前比较购买数量和可用库存，库存不足时拒绝下单。",
    acceptanceCriteria: [
      "库存充足时允许下单",
      "库存不足时返回明确错误",
      "相关 pytest 测试通过"
    ]
  }
];

type GeneratedPlanTask = Omit<
  GeneratedPlanDraft["tasks"][number],
  never
>;

export interface PlanActor {
  actorId: MemberId;
}

export class DeepSeekPlanner {
  constructor(
    private readonly apiKey = process.env.DEEPSEEK_API_KEY,
    private readonly baseUrl =
      process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    private readonly model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat"
  ) {}

  async generate(
    requirements: Requirement[],
    _actor: PlanActor
  ): Promise<GeneratedPlanDraft> {
    if (!this.apiKey) {
      return this.fallback("未配置 DEEPSEEK_API_KEY");
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "你是软件项目计划助手。只返回 JSON，不要返回 Markdown。任务动作必须分别为 inventory_summary、discount_rule、stock_validation。"
              },
              {
                role: "user",
                content: JSON.stringify({
                  instruction:
                    "根据已确认需求生成三个任务。返回 {summary,tasks:[{demoAction,title,description,acceptanceCriteria}]}。每个任务给出1至4条可检查的验收条件。",
                  confirmedRequirements: requirements.map((item) => ({
                    id: item.id,
                    title: item.title,
                    content: item.content
                  }))
                })
              }
            ]
          })
        }
      ).finally(() => clearTimeout(timer));

      if (!response.ok) {
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("DeepSeek 未返回计划内容");
      }

      const parsed = responseSchema.parse(JSON.parse(content));
      const byAction = new Map(
        parsed.tasks.map((task) => [task.demoAction, task])
      );
      const tasks = fallbackTasks.map((fallback) => {
        const modelTask = byAction.get(fallback.demoAction);
        return modelTask
          ? {
              demoAction: modelTask.demoAction,
              title: modelTask.title,
              description: modelTask.description,
              acceptanceCriteria: modelTask.acceptanceCriteria
            }
          : fallback;
      });

      return {
        summary: parsed.summary,
        source: "deepseek",
        sourceLabel: `DeepSeek 实时生成（${this.model}）`,
        tasks
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "未知模型错误";
      return this.fallback(`DeepSeek 调用失败：${message}`);
    }
  }

  private fallback(reason: string): GeneratedPlanDraft {
    return {
      summary:
        "围绕已确认需求，依次完成库存汇总、满额折扣和库存校验，并保留测试证据。",
      source: "fallback",
      sourceLabel: `离线备用计划（${reason}）`,
      tasks: fallbackTasks.map((task) => ({
        ...task,
        acceptanceCriteria: [...task.acceptanceCriteria]
      }))
    };
  }
}

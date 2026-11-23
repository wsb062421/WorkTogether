import type {
  ActivityEvent,
  AppSnapshot,
  MemberId,
  Requirement
} from "@shared/contracts";

const iso = (offsetMs = 0) =>
  new Date(Date.now() + offsetMs).toISOString();

function requirement(
  id: string,
  title: string,
  content: string,
  authorId: MemberId,
  confirmedBy: MemberId | null,
  status: Requirement["status"],
  offsetMs: number
): Requirement {
  return {
    id,
    title,
    content,
    authorId,
    confirmedBy,
    status,
    version: 1,
    createdAt: iso(offsetMs),
    updatedAt: iso(offsetMs)
  };
}

export function createSeedState(): AppSnapshot {
  const requirements = [
    requirement(
      "req-inventory",
      "相同商品库存需要汇总",
      "相同商品编号的多条库存记录必须合并为一条汇总结果，数量求和，不能只保留最后一条记录。",
      "member-a",
      "member-a",
      "confirmed",
      -180_000
    ),
    requirement(
      "req-discount",
      "订单满一百元享受九折",
      "订单原始金额达到 100 元时，客户应付金额按九折计算；不足 100 元时按原价支付。",
      "member-b",
      "member-b",
      "confirmed",
      -150_000
    ),
    requirement(
      "req-stock",
      "库存不足时禁止下单",
      "请求购买数量大于当前可用库存时，系统必须拒绝生成待交付订单并给出明确错误。",
      "member-a",
      null,
      "proposed",
      -120_000
    )
  ];

  const events: ActivityEvent[] = [
    {
      id: "event-seed",
      type: "project_seeded",
      actorId: "member-a",
      objectId: "project-demo",
      summary: "创建演示项目并载入初始需求",
      createdAt: iso(-200_000)
    },
    ...requirements.map((item, index) => ({
      id: `event-requirement-${index + 1}`,
      type: "requirement_created" as const,
      actorId: item.authorId,
      objectId: item.id,
      summary: `提出需求：${item.title}`,
      createdAt: item.createdAt
    }))
  ];

  return {
    schemaVersion: 1,
    project: {
      id: "project-demo",
      name: "迷你库存协作开发",
      repositoryName: "team-agent-demo / inventory-demo",
      planVersion: 0,
      createdAt: iso(-240_000),
      updatedAt: iso()
    },
    members: [
      {
        id: "member-a",
        name: "成员甲",
        role: "需求与最终验收",
        status: "online"
      },
      {
        id: "member-b",
        name: "成员乙",
        role: "代码执行与测试",
        status: "online"
      }
    ],
    requirements,
    plan: null,
    tasks: [],
    codeLinks: [],
    testResults: [],
    handovers: [],
    impacts: [],
    events,
    updatedAt: iso()
  };
}

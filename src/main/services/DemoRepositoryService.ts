import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { DemoAction } from "@shared/contracts";

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface TaskRecipe {
  file: string;
  testFile: string;
  content: string;
}

const solutionByAction: Record<DemoAction, TaskRecipe> = {
  inventory_summary: {
    file: "app/inventory.py",
    testFile: "tests/test_inventory.py",
    content: `def summarize_inventory(items):
    summary = {}
    for item in items:
        sku = item["sku"]
        summary[sku] = summary.get(sku, 0) + item["quantity"]
    return summary
`
  },
  discount_rule: {
    file: "app/pricing.py",
    testFile: "tests/test_pricing.py",
    content: `def payable_amount(items, discount_threshold=100, discount_rate=0.1):
    subtotal = sum(item["price"] * item["quantity"] for item in items)
    if subtotal >= discount_threshold:
        return round(subtotal * (1 - discount_rate), 2)
    return round(subtotal, 2)
`
  },
  stock_validation: {
    file: "app/orders.py",
    testFile: "tests/test_orders.py",
    content: `class StockError(ValueError):
    pass


def create_order(sku, quantity, available):
    if quantity <= 0:
        raise ValueError("购买数量必须大于零")
    if quantity > available:
        raise StockError(f"库存不足：可用 {available}，请求 {quantity}")
    return {
        "sku": sku,
        "quantity": quantity,
        "status": "pending_delivery",
    }
`
  }
};

export class DemoRepositoryService {
  private pythonCommand: { command: string; prefixArgs: string[] } | null =
    null;

  constructor(
    private readonly workspacePath: string,
    private readonly templatePath: string,
    private readonly pythonRoot = process.cwd()
  ) {}

  async ensureWorkspace(): Promise<void> {
    const requiredFiles = [
      "app/inventory.py",
      "app/pricing.py",
      "app/orders.py",
      "tests/test_inventory.py",
      "tests/test_pricing.py",
      "tests/test_orders.py"
    ];
    const workspaceIsUsable =
      existsSync(join(this.workspacePath, ".git")) &&
      requiredFiles.every((file) =>
        existsSync(join(this.workspacePath, file))
      );
    if (!workspaceIsUsable) {
      await this.resetWorkspace();
    }
  }

  async resetWorkspace(): Promise<void> {
    if (existsSync(this.workspacePath)) {
      rmSync(this.workspacePath, { recursive: true, force: true });
    }
    mkdirSync(dirname(this.workspacePath), { recursive: true });
    cpSync(this.templatePath, this.workspacePath, { recursive: true });
    const init = await this.runCommand(
      "git",
      ["init", "-b", "main"],
      this.workspacePath
    );
    if (init.code !== 0) {
      throw new Error(`初始化演示仓库失败：${init.stderr}`);
    }
    await this.commitAll("初始化演示仓库");
  }

  async executeTask(
    taskId: string,
    action: DemoAction
  ): Promise<{
    diff: string;
    commit: string;
    filePath: string;
    command: string;
    exitCode: number;
    passed: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
  }> {
    await this.ensureWorkspace();
    const recipe = solutionByAction[action];
    const targetPath = join(this.workspacePath, recipe.file);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, recipe.content, "utf8");

    const diffResult = await this.runGit(["diff", "--", recipe.file]);
    const python = this.resolvePython();
    const command = python
      ? `${python.display} -m pytest -q ${recipe.testFile}`
      : `python -m pytest -q ${recipe.testFile}`;
    const startedAt = Date.now();
    let test: ProcessResult;
    if (python) {
      test = await this.runCommand(
        python.command,
        [...python.prefixArgs, "-m", "pytest", "-q", recipe.testFile],
        this.workspacePath,
        45_000
      );
    } else {
      test = {
          code: 127,
          stdout: "",
          stderr:
            "未找到可用的 Python。请在 .env.local 中设置 PYTHON_BIN，或创建项目 .venv。"
      };
    }
    const durationMs = Date.now() - startedAt;

    let commit = "";
    if (test.code === 0) {
      await this.commitAll(`完成任务 ${taskId}：${recipe.file}`);
      const rev = await this.runGit(["rev-parse", "HEAD"]);
      commit = rev.stdout.trim();
    }

    return {
      diff:
        diffResult.stdout ||
        `已写入 ${recipe.file}。若 diff 为空，说明该文件已由当前任务修复。`,
      commit,
      filePath: recipe.file,
      command,
      exitCode: test.code,
      passed: test.code === 0,
      durationMs,
      stdout: test.stdout,
      stderr: test.stderr
    };
  }

  readFile(filePath: string): string {
    return readFileSync(join(this.workspacePath, filePath), "utf8");
  }

  private async commitAll(message: string): Promise<ProcessResult> {
    await this.runGit(["add", "."]);
    return this.runGit(
      [
        "commit",
        "-m",
        message
      ],
      true
    );
  }

  private runGit(
    args: string[],
    allowEmptyFailure = false
  ): Promise<ProcessResult> {
    return this.runCommand(
      "git",
      [
        "-c",
        "user.name=团队协作智能体",
        "-c",
        "user.email=demo@local",
        ...args
      ],
      this.workspacePath
    ).then((result) => {
      if (result.code !== 0 && !allowEmptyFailure) {
        throw new Error(result.stderr || `git ${args.join(" ")} 失败`);
      }
      return result;
    });
  }

  private resolvePython():
    | { command: string; prefixArgs: string[]; display: string }
    | null {
    if (this.pythonCommand) {
      return {
        ...this.pythonCommand,
        display: this.pythonCommand.command
      };
    }

    const candidates: Array<{
      command: string;
      prefixArgs: string[];
    }> = [
      ...(process.env.PYTHON_BIN
        ? [
            {
              command: process.env.PYTHON_BIN,
              prefixArgs: [] as string[]
            }
          ]
        : []),
      {
        command: join(this.pythonRoot, ".venv", "Scripts", "python.exe"),
        prefixArgs: []
      },
      { command: "python", prefixArgs: [] },
      { command: "py", prefixArgs: ["-3"] }
    ];

    for (const candidate of candidates) {
      const result = spawnSync(
        candidate.command,
        [...candidate.prefixArgs, "-c", "import pytest"],
        {
          windowsHide: true,
          encoding: "utf8",
          timeout: 10_000
        }
      );
      if (!result.error && result.status === 0) {
        this.pythonCommand = candidate;
        return {
          ...candidate,
          display: `${candidate.command} ${candidate.prefixArgs.join(" ")}`.trim()
        };
      }
    }
    return null;
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs = 15_000
  ): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8"
        }
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          child.kill();
          settled = true;
          resolve({
            code: 124,
            stdout,
            stderr: `${stderr}\n命令执行超时`
          });
        }
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          resolve({ code: 127, stdout, stderr: String(error) });
        }
      });
      child.on("close", (code) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          resolve({ code: code ?? 1, stdout, stderr });
        }
      });
    });
  }
}

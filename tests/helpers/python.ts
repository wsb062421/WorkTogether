import { existsSync } from "node:fs";
import { join } from "node:path";

export function pythonExecutable(): string {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const virtualEnvironmentPython = join(
    process.cwd(),
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
  );
  if (existsSync(virtualEnvironmentPython)) {
    return virtualEnvironmentPython;
  }

  return process.platform === "win32" ? "python" : "python3";
}

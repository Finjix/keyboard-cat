const { execFileSync } = require("node:child_process");
const { rmSync } = require("node:fs");
const { resolve, dirname } = require("node:path");

const root = resolve(__dirname, "..");
const release = resolve(root, "release");
if (dirname(release) !== root) throw Error("Invalid release directory");

// Check before deleting anything: Windows locks files of a running portable app.
if (process.platform === "win32") {
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        '$prefix = $env:MENGSHU_RELEASE_DIR + "\\"; ' +
          "$running = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) }; " +
          "if ($running) { exit 3 }",
      ],
      { env: { ...process.env, MENGSHU_RELEASE_DIR: release }, stdio: "pipe" },
    );
  } catch {
    throw Error(
      "无法清理 release：请先通过齿轮退出其中运行的懵薯；若已退出，请检查进程查询权限后重试。",
    );
  }
}
if (process.argv.includes("--clean")) {
  rmSync(release, { recursive: true, force: true });
  console.log("Removed previous release; the next build replaces it.");
} else {
  console.log("Release directory check passed (no files changed).");
}

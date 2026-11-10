// 删除运行时不需要的文件（Electron/Chromium 许可证文本）
const { rmSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async ({ appOutDir }) => {
  for (const f of ["LICENSE.electron.txt", "LICENSES.chromium.html"]) {
    rmSync(join(appOutDir, f), { force: true });
  }
};

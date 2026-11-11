// release/ 只留一个解压即用的程序文件夹：把 win-unpacked 改名，删除其他产物。
const { readdirSync, renameSync, rmSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const root = resolve(__dirname, "..");
const release = resolve(root, "release");
const { version } = require("../package.json");
const name = `懵薯-${version}-Windows-x64`;
const unpacked = resolve(release, "win-unpacked");
if (!existsSync(resolve(unpacked, "懵薯.exe")))
  throw new Error(`Unpacked app missing: ${unpacked}`);
for (const entry of readdirSync(release))
  if (entry !== "win-unpacked")
    rmSync(resolve(release, entry), { recursive: true, force: true });
renameSync(unpacked, resolve(release, name));
console.log(`Portable folder: ${resolve(release, name)}`);

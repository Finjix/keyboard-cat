const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { resolve } = require("node:path");
const root = resolve(__dirname, "..");
const { version } = require("../package.json");
const name = `懵薯-${version}-Windows-x64.zip`;
const source = resolve(root, "release", name);
if (!existsSync(source)) throw new Error(`Release ZIP missing: ${source}`);
const hash = createHash("sha256")
  .update(readFileSync(source))
  .digest("hex")
  .toUpperCase();
writeFileSync(
  resolve(root, "release", "SHA256SUMS.txt"),
  `${hash}  ${name}\n`,
  "utf8",
);
console.log(`Portable release: ${source}`);

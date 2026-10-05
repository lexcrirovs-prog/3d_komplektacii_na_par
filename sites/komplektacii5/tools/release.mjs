import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {execFileSync} from 'node:child_process';
const walk = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
      ),
    )
  ).flat();
const files = [];
for (const path of (await walk("dist")).filter(
  (p) => !p.endsWith("DEPLOY_MANIFEST.json"),
)) {
  const bytes = await readFile(path);
  files.push({
    path: path.slice(5),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...(path.endsWith(".js") ? { gzipBytes: gzipSync(bytes).length } : {}),
  });
}
const manifest = {
  applicationCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceTreeDirty: !!execFileSync('git',['status','--porcelain','--','.'],{encoding:'utf8'}).trim(),
  version: "2026.10.01.1",
  date: "2026-10-01",
  executor: "Codex / GPT-6",
  status: "LOCAL_REVIEW",
  sourceCommit: "cc919366206eb317e7f21e90247ed1870cb276cd",
  target: "https://prgz.ru/komplektacii5/",
  files,
};
await writeFile("dist/DEPLOY_MANIFEST.json", JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify(
    {
      files: files.length,
      bytes: files.reduce((a, b) => a + b.bytes, 0),
      allJavascriptGzip: files.reduce((a, b) => a + (b.gzipBytes || 0), 0),
      publication: "NOT_DEPLOYED",
    },
    null,
    2,
  ),
);

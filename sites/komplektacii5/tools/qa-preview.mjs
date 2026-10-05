// Local review server only. Never deployed; artifact writes are fenced to reports/local.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
const root = resolve("dist"),
  artifacts = resolve("reports/local"),
  port = 5186;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".stp": "application/step",
};
await mkdir(artifacts, { recursive: true });
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    if (req.method === "POST" && url.pathname === "/__qa-artifact") {
      if (req.headers.origin !== `http://127.0.0.1:${port}`) {
        res.writeHead(403);
        res.end();
        return;
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 15000000) throw Error("Large artifact");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks));
      if (!/^[a-z0-9-]+\.(png|webp|json)$/.test(body.name))
        throw Error("Invalid artifact name");
      await writeFile(
        resolve(artifacts, body.name),
        body.base64
          ? Buffer.from(body.base64, "base64")
          : JSON.stringify(body.data, null, 2),
      );
      res.end("saved");
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "error",
          message:
            "Локальный просмотр. Почтовая отправка ещё не подключена; данные формы сохранены.",
        }),
      );
      return;
    }
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(root + sep)) throw Error("Invalid path");
    let bytes = await readFile(path);
    const headers = {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    };
    if (
      /\.(js|css|json|html|svg|glb)$/.test(path) &&
      req.headers["accept-encoding"]?.includes("gzip")
    ) {
      bytes = gzipSync(bytes);
      headers["Content-Encoding"] = "gzip";
    }
    res.writeHead(200, headers);
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Local review http://127.0.0.1:${port}`),
);

// Local fixture server: identical gzip/cache behavior for before and after builds.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const [baseline, candidate, port = '4174'] = process.argv.slice(2);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.glb':'model/gltf-binary', '.png':'image/png', '.json':'application/json' };
createServer(async(req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const [variant, ...segments] = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (!['before','after'].includes(variant)) throw new Error('Unknown fixture');
    const root = resolve(variant === 'before' ? baseline : candidate);
    let file = resolve(root,...segments);
    if (file !== root && !file.startsWith(root+sep)) throw new Error('Invalid path');
    if ((await stat(file)).isDirectory()) file=resolve(file,'index.html');
    const body=await readFile(file), etag='"'+createHash('sha256').update(body).digest('hex')+'"';
    res.setHeader('Content-Type',types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control',file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.setHeader('ETag',etag);
    if(req.headers['if-none-match']===etag) { res.writeHead(304);res.end();return; }
    const gzip = /gzip/.test(req.headers['accept-encoding']||'') && /\.(html|js|css|json)$/.test(file);
    if(gzip) { res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding'); }
    const data=gzip?gzipSync(body):body;
    res.setHeader('Content-Length',data.length);res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(Number(port),'127.0.0.1',()=>console.log(`Profiling http://127.0.0.1:${port}/before/ and /after/`));

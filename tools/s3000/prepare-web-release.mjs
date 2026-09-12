// Version and cache policy belong to the generated release, scoped to this directory.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const version = JSON.parse(await readFile('src/assets/s4000/web/version.json','utf8'));
const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await writeFile('dist/version.json',JSON.stringify({...version,source_commit:commit,url:'https://prgz.ru/komplektacii4/'},null,2)+'\n');
await mkdir('dist/assets',{recursive:true});
await writeFile('dist/.htaccess',`# PREMIUM S-3000 only. Do not move to the website root.\n<IfModule mod_headers.c>\n  <FilesMatch "\\.(html|json)$">\n    Header set Cache-Control "no-cache"\n  </FilesMatch>\n</IfModule>\nAddType model/gltf-binary .glb\n<IfModule mod_deflate.c>\n  AddOutputFilterByType DEFLATE model/gltf-binary application/javascript text/javascript text/css application/json text/html\n</IfModule>\n`);
await writeFile('dist/assets/.htaccess',`# Vite content hashes make these URLs immutable.\n<IfModule mod_headers.c>\n  Header set Cache-Control "public, max-age=31536000, immutable"\n</IfModule>\n`);
const records=[];
async function walk(dir) {
  for(const e of await readdir(dir,{withFileTypes:true})) {
    const path=dir+'/'+e.name;
    if(e.isDirectory()) await walk(path);
    else if(e.name!=='DEPLOY_MANIFEST.json') {
      const b=await readFile(path);records.push({path:path.slice(5),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
    }
  }
}
await walk('dist');records.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile('dist/DEPLOY_MANIFEST.json',JSON.stringify({release:version,source_commit:commit,files:records},null,2)+'\n');
console.log(JSON.stringify({version:version.version,files:records.length+1,bytes:records.reduce((n,f)=>n+f.bytes,0)}));

import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('node_modules'),out=path.resolve('third-party-licenses');await fs.mkdir(out,{recursive:true});
const manifest=[];
async function visit(dir){for(const ent of await fs.readdir(dir,{withFileTypes:true})){if(ent.name.startsWith('.'))continue;const folder=path.join(dir,ent.name);if(!ent.isDirectory())continue;if(ent.name.startsWith('@')){await visit(folder);continue}try{const pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));const dest=path.join(out,pkg.name.replaceAll('/','__'));const files=(await fs.readdir(folder)).filter(n=>/^(license|licence|copying|notice)(\.|$)/i.test(n));await fs.mkdir(dest,{recursive:true});for(const f of files)if((await fs.stat(path.join(folder,f))).isFile())await fs.copyFile(path.join(folder,f),path.join(dest,f));manifest.push({name:pkg.name,version:pkg.version,license:pkg.license??null,files});}catch{}}}
await visit(root);await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(`Preserved notices for ${manifest.length} packages.`);

import {readFile,mkdir,readdir,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),assets={};
for(const file of await readdir(path.join(root,'client')))assets['/'+file]=await readFile(path.join(root,'client',file),'utf8');
const backend=await readFile(path.join(root,'api/model.js'),'utf8');
await rm(path.join(root,'dist'),{recursive:true,force:true});
await mkdir(path.join(root,'dist/server'),{recursive:true});
await writeFile(path.join(root,'dist/server/index.js'),backend+'\nconst ASSETS='+JSON.stringify(assets)+`;\nexport default {async fetch(request,env){
 const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return modelAPI(request,env);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const key=url.pathname==='/'?'/index.html':url.pathname,body=ASSETS[key];
 if(body===undefined)return new Response('Not found',{status:404});
 const ext=key.split('.').at(-1),types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml'};
 return new Response(request.method==='HEAD'?null:body,{headers:{'content-type':(types[ext]||'text/plain')+'; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'}});
}};\n`);
console.log('Built Worker ESM with embedded client assets.');

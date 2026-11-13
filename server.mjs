import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid PORT');
import {readFile} from 'node:fs/promises';
import worker from './dist/server/index.js';
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const server=http.createServer(async(req,res)=>{
 try{
  const request=new Request(new URL(req.url,'http://'+(req.headers.host||'127.0.0.1:4173')),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
  let response;
  if(new URL(request.url).pathname==='/api/verified-run'){
   if(request.method!=='GET')response=new Response('Method not allowed',{status:405});
   else try{response=new Response(await readFile(path.join(root,'examples/verified-run.json')),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}catch{response=new Response('No verified run',{status:404});}
  }else response=await worker.fetch(request,process.env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Local server error');}
});
server.listen(port,'127.0.0.1',()=>console.log('OntoFlow: http://127.0.0.1:'+server.address().port));

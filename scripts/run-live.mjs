// Integration run through the same controller/API as the UI. No fixture planner.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRun,metrics} from '../client/engine.js';
import {AgentController} from '../client/controller.js';
const run=createRun();
run.source={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:{},runtime:process.version};
for(const path of ['client/engine.js','client/controller.js','api/model.js'])run.source.files[path]=createHash('sha256').update(await readFile(path)).digest('hex');
const directory='runs';
await mkdir(directory,{recursive:true});
const file=directory+'/llm-run-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
const agent=new AgentController(async(context,signal)=>{
 const response=await fetch((process.env.ONTOFLOW_URL||'http://127.0.0.1:4173')+'/api/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(context),signal});
 const data=await response.json();if(!response.ok)throw Error(data.error);return data;
});
console.log(JSON.stringify({event:'started',file}));
for(let i=0;i<60;i++){
 try{
  const e=await agent.step(run);
  console.log(JSON.stringify({call:e?.id,tool:e?.toolId,outcome:e?.outcome,execution:e?.execution,bindings:e?.bindings,reason:e?.decision?.reason,status:run.status}));
  await writeFile(file,JSON.stringify(run,null,2)+'\n');
  if(!e||['completed','failed'].includes(run.status))break;
 }catch(e){run.status='paused';run.integrationError=e.message;await writeFile(file,JSON.stringify(run,null,2)+'\n');console.log(JSON.stringify({error:e.message,file}));process.exitCode=1;break;}
}
if(run.status==='running'){run.status='paused';run.integrationError='Reached integration limit of 60 decisions';await writeFile(file,JSON.stringify(run,null,2)+'\n');}
console.log(JSON.stringify({event:'finished',file,metrics:metrics(run),status:run.status,report:run.objects.find(o=>o.type==='ResearchReport')}));

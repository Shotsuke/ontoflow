// Explicit deterministic TEST FIXTURE. Not imported by the browser or server.
import {invoke,inspect,ports} from '../client/engine.js';
export function step(run,rateMethod='fit_rate'){
 if(['completed','failed'].includes(run.status))return null;
 for(const t of run.registry){
  if(t.implementation.startsWith('fit_rate')&&t.implementation!==rateMethod)continue;
  const sets=t.inputs.map(type=>{const all=run.objects.filter(o=>o.type===type.replace('[]',''));return type.endsWith('[]')?[all.filter(o=>o.role===(t.implementation==='validate'?'holdout':'train'))]:all;});
  const rows=sets.reduce((a,b)=>a.flatMap(row=>b.map(x=>[...row,x])),[[]]);
  for(const row of rows){const args=Object.fromEntries(ports[t.implementation].map((name,i)=>[name,row[i]]));const bindings=Object.fromEntries(Object.entries(args).map(([k,v])=>[k,Array.isArray(v)?v.map(o=>o.id):v.id]));
   if(run.executedKeys.includes(t.implementation+':'+JSON.stringify(bindings)))continue;
   if(inspect(run,t,args).every(c=>c.status==='satisfied'))return invoke(run,t.id,bindings);
  }
 }
 run.status='waiting';return null;
}
export function finish(run,rateMethod='fit_rate'){for(let i=0;i<100;i++)if(!step(run,rateMethod))break;return run;}

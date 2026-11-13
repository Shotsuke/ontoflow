// Independent synthetic scenario. No data or configuration from other platforms.
export const R=8.314462618;
export const TYPES={
 RawTrace:{name:'原始反应记录',description:'以时间、信号和温度记录一次独立的合成反应。',fields:['experimentId','traceId','temperatureC','timeUnit','rows','role']},
 Trace:{name:'反应曲线',description:'已读取并关联到实验的时间序列，尚未检查质量。',fields:['experimentId','traceId','temperatureC','timeUnit','rows','role']},
 QualityCheck:{name:'质量检查',description:'针对某条曲线的完整性、正值与时间顺序证据。',fields:['experimentId','traceId','passed','points','issues']},
 NormalizedTrace:{name:'标准化曲线',description:'时间转换为秒、温度转换为 K，保留原始曲线血缘。',fields:['experimentId','traceId','temperatureK','temperatureUnit','timeUnit','qualityPassed','rows','role']},
 RateEstimate:{name:'速率估计',description:'用已登记算法估计浓度衰减，得到每秒速率常数及拟合质量。',fields:['experimentId','traceId','temperatureK','temperatureUnit','k','unit','r2','role']},
 RateSeries:{name:'训练速率集合',description:'覆盖全部训练曲线的速率估计及其来源。',fields:['experimentId','items','traceIds','complete']},
 ArrheniusModel:{name:'温度响应模型',description:'ln(k) 对 1/T 的线性拟合；产生表观活化能。',fields:['experimentId','activationEnergy','energyUnit','lnA','r2','trainingTraceIds']},
 Prediction:{name:'留出预测',description:'仅利用训练模型预测留出温度下的速率常数。',fields:['experimentId','temperatureK','k','unit','modelId']},
 Validation:{name:'独立留出检查',description:'以未参加模型拟合的曲线检查预测相对误差。',fields:['experimentId','predictionId','modelId','holdoutTraceIds','observedK','predictedK','relativeError','passed']},
 ResearchReport:{name:'分析报告',description:'关联模型和通过检查的留出验证，形成最终产物。',fields:['experimentId','modelId','validationId','activationEnergy','relativeError','summary']}
};
const recipes=[
 ['read_trace','读取反应记录','数据接入','RawTrace','Trace','将模拟数据源的一条原始记录映射到反应曲线对象。'],
 ['check_quality','检查曲线质量','质量检查','Trace','QualityCheck','检查样本数、时间单调性与浓度正值，生成可追溯质量证据。'],
 ['normalize','统一物理单位','数据处理','Trace,QualityCheck','NormalizedTrace','绑定同一曲线的质量检查，将 min 转换为 s、℃ 转换为 K。'],
 ['fit_rate','拟合一级反应速率','数值计算','NormalizedTrace','RateEstimate','拟合 ln(c/c₀) = −kt + b，输出速率、单位与拟合质量。'],
 ['fit_rate_robust','稳健估计反应速率','数值计算','NormalizedTrace','RateEstimate','取所有观测对的对数浓度斜率中位数（Theil–Sen），降低离群点影响，输出同一种速率对象。'],
 ['aggregate','汇集训练速率','集合操作','RateEstimate[]','RateSeries','汇集全部训练曲线的速率，检查集合覆盖与实验归属。'],
 ['fit_arrhenius','拟合温度响应','数值计算','RateSeries','ArrheniusModel','拟合 ln(k) = ln(A) − Eₐ/(RT)，仅使用训练温度。'],
 ['predict','预测留出温度','预测','ArrheniusModel','Prediction','预测未参与模型拟合的 328.15 K 条件下的速率。'],
 ['validate','检验留出预测','结果验证','Prediction,RateEstimate[]','Validation','使用留出曲线估计值计算相对误差，阈值由任务给定。'],
 ['report','生成分析报告','结果交付','ArrheniusModel,Validation','ResearchReport','关联模型和同源验证结果；只有完成判据满足才能生成。']
];
export const RULES={
 same_trace:{text:'曲线与质量检查必须指向同一次实验记录',test:(r,a)=>a.trace.traceId===a.quality.traceId},
 qc:{text:'质量检查已通过',test:(r,a)=>a.quality.passed},
 source_units:{text:'原始时间单位存在已登记转换',test:(r,a)=>['s','min'].includes(a.trace.timeUnit)},
 units:{text:'速率拟合要求秒与绝对温度 K',test:(r,a)=>a.curve.timeUnit==='s'&&a.curve.temperatureUnit==='K'},
 quality:{text:'标准化曲线具备质量证据',test:(r,a)=>a.curve.qualityPassed},
 train_only:{text:'温度模型只能使用训练曲线',test:(r,a)=>a.rates.every(x=>x.role==='train')},
 coverage:{text:'完整覆盖全部训练曲线，无重复和遗漏',test:(r,a)=>a.rates.length===r.task.trainingTraceIds.length&&unique(a.rates.map(x=>x.traceId)).length===a.rates.length&&r.task.trainingTraceIds.every(id=>a.rates.some(x=>x.traceId===id))},
 rate_units:{text:'速率单位为 s⁻¹，温度为 K',test:(r,a)=>a.rates.every(x=>x.unit==='s^-1'&&x.temperatureUnit==='K'&&x.k>0)},
 temperature_coverage:{text:'完整集合至少含三个训练温度',test:(r,a)=>a.series.complete&&unique(a.series.items.map(x=>x.temperatureK)).length>=3},
 holdout:{text:'验证仅使用完整的留出曲线集合',test:(r,a)=>a.rates.length===r.task.holdoutTraceIds.length&&unique(a.rates.map(x=>x.traceId)).length===a.rates.length&&r.task.holdoutTraceIds.every(id=>a.rates.some(x=>x.traceId===id))&&a.rates.every(x=>x.role==='holdout')},
 validation_units:{text:'留出观测与预测使用相同温度和速率单位',test:(r,a)=>a.rates.every(x=>x.unit===a.prediction.unit&&Math.abs(x.temperatureK-a.prediction.temperatureK)<1e-9)},
 validated:{text:'留出预测相对误差满足任务阈值',test:(r,a)=>a.validation.passed},
 same_model:{text:'验证必须对应本次模型',test:(r,a)=>a.validation.modelId===a.model.id}
};
// Machine-readable identity/cardinality semantics, shared by explanation and context.
RULES.coverage.definition={operator:'exactly_one_per_identity',input:'rates',identity:'traceId',required_identities_from:'task.trainingTraceIds',allow_extra_identities:false};
RULES.holdout.definition={operator:'exactly_one_per_identity',input:'rates',identity:'traceId',required_identities_from:'task.holdoutTraceIds',required_role:'holdout',allow_extra_identities:false};
function collectionEvidence(run,args,required){
 const expected=run.task[required],groups={};
 for(const o of args.rates)(groups[o.traceId]??=[]).push(o.id);
 return {identity:'traceId',required_count:expected.length,provided_count:args.rates.length,required_identities:expected,missing_identities:expected.filter(id=>!groups[id]),duplicate_identities:Object.fromEntries(Object.entries(groups).filter(([,ids])=>ids.length>1)),unexpected_identities:Object.keys(groups).filter(id=>!expected.includes(id)),max_objects_per_identity:1};
}
RULES.coverage.evidence=(run,args)=>collectionEvidence(run,args,'trainingTraceIds');
RULES.holdout.evidence=(run,args)=>collectionEvidence(run,args,'holdoutTraceIds');
const requiredRules={normalize:['same_trace','qc','source_units'],fit_rate:['units','quality'],fit_rate_robust:['units','quality'],aggregate:['train_only','coverage','rate_units'],fit_arrhenius:['temperature_coverage'],validate:['holdout','validation_units'],report:['validated','same_model']};
export const CATALOG=recipes.map(([implementation,name,category,input,output,description])=>({id:implementation,implementation,name,description,category,version:'1.0.0',ontology:'kinetics/0.1',method_of:input.split(',')[0].replace('[]',''),inputs:input.split(','),output,requires:requiredRules[implementation]||[],result_mapping:{type:output,identity:'new_artifact',experiment:'preserve_input',evidence:'executed_call'}}));
export const CODE_EXAMPLE=`function fitRate(curve) {\n  // 输入：NormalizedTrace，时间 s，温度 K\n  const x = curve.rows.map(p => p.t);\n  const y = curve.rows.map(p => Math.log(p.c));\n  const fit = linearFit(x, y);\n  return {\n    traceId: curve.traceId,\n    experimentId: curve.experimentId,\n    temperatureK: curve.temperatureK,\n    k: -fit.slope, unit: 's^-1', r2: fit.r2,\n    role: curve.role\n  };\n}`;
const clone=x=>structuredClone(x);
export function validateRegistration(spec){
 const errors=[]; const base=CATALOG.find(t=>t.implementation===spec?.implementation);
 if(!base)return ['请选择已安装的函数实现'];
 if(!/^[a-z][a-z0-9_]{2,47}$/.test(spec.id||''))errors.push('工具 ID 需为 3–48 位小写字母、数字或下划线');
 if(typeof spec.name!=='string'||!spec.name.trim()||spec.name.length>80)errors.push('工具名称需为 1–80 字符');
 if(typeof spec.description!=='string'||!spec.description.trim()||spec.description.length>800)errors.push('功能说明需为 1–800 字符');
 if(spec.ontology!=='kinetics/0.1')errors.push('本体版本不匹配');
 if(spec.output!==base.output)errors.push(`函数实现输出必须绑定 ${base.output}`);
 if(JSON.stringify(spec.inputs)!==JSON.stringify(base.inputs))errors.push('输入对象声明与函数实现不匹配');
 if(JSON.stringify(spec.requires)!==JSON.stringify(base.requires))errors.push('调用条件必须保留已安装函数的规则引用');
 if(JSON.stringify(spec.result_mapping)!==JSON.stringify(base.result_mapping))errors.push('输出映射必须与已安装函数一致');
 if(spec.method_of!==base.method_of)errors.push('对象方法归属与函数不一致');
 if(spec.version!=='1.0.0')errors.push('本演示适配器仅支持版本 1.0.0');
 return errors;
}
export function linearFit(x,y){
 if(x.length<3||x.length!==y.length||![...x,...y].every(Number.isFinite))throw Error('拟合数据不完整');
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length, mx=mean(x),my=mean(y);
 const xx=x.reduce((s,v)=>s+(v-mx)**2,0); if(xx<=0)throw Error('自变量无变化');
 const slope=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/xx, intercept=my-slope*mx;
 const ss=y.reduce((s,v)=>s+(v-my)**2,0), residual=y.reduce((s,v,i)=>s+(v-intercept-slope*x[i])**2,0);
 return {slope,intercept,r2:ss?1-residual/ss:1};
}
export const DATA_BINDING={id:'synthetic-kinetics-binding/1',source:'simulation_records',concept:'RawTrace',identity:['reaction_id','run_id'],properties:{experimentId:'reaction_id',traceId:'run_id',temperatureC:'temp_c',timeUnit:'time_unit',rows:'observations',role:'split'},provenance:'independently_generated_equations'};
export function syntheticData(seed=42){
 let state=seed>>>0;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
 const rows=[];
 for(const [ti,temp] of [298.15,308.15,318.15,328.15].entries())for(let rep=1;rep<=2;rep++){
  const k=.002*Math.exp(40000/R*(1/298.15-1/temp));
  const points=Array.from({length:12},(_,i)=>{const t=i*10;return {time:rep===2?t/60:t,concentration:Math.exp(-k*t)*(1+(random()-.5)*.012)};});
  rows.push({reaction_id:'SYN-KIN-001',run_id:`T${ti+1}-R${rep}`,temp_c:temp-273.15,time_unit:rep===2?'min':'s',observations:points,split:ti===3?'holdout':'train'});
 }
 return rows.map((row,i)=>({...Object.fromEntries(Object.entries(DATA_BINDING.properties).map(([semantic,column])=>[semantic,row[column]])),id:`raw-${Math.floor(i/2)}-${i%2+1}`,type:DATA_BINDING.concept,depth:0,parents:[],evidence:'synthetic-generator/v1',source:'independent-synthetic',binding:DATA_BINDING.id}));
}
export function createRun(registry=CATALOG,seed=42){const objects=syntheticData(seed);return {version:'ontoflow-run/0.2',controller:'llm-proposal-ontology-gate',seed,task:{experimentId:'SYN-KIN-001',targetType:'ResearchReport',holdoutK:328.15,maxRelativeError:.05,trainingTraceIds:objects.filter(o=>o.role==='train').map(o=>o.traceId),holdoutTraceIds:objects.filter(o=>o.role==='holdout').map(o=>o.traceId)},registry:clone(registry),objects,events:[],status:'ready',sequence:0,executedKeys:[]};}
function unique(a){return [...new Set(a)];}
export const ports={read_trace:['raw'],check_quality:['trace'],normalize:['trace','quality'],fit_rate:['curve'],fit_rate_robust:['curve'],aggregate:['rates'],fit_arrhenius:['series'],predict:['model'],validate:['prediction','rates'],report:['model','validation']};
function check(id,ok,description){return {id,status:ok===undefined?'unknown':ok?'satisfied':'violated',description};}
export function inspect(run,tool,args){
 const checks=[];args=args||{};const recipe=CATALOG.find(t=>t.implementation===tool.implementation);if(!recipe)return [check('registered',false,'未安装函数实现')];
 checks.push(check('parameters',Object.keys(args).length===ports[tool.implementation].length&&ports[tool.implementation].every(k=>Object.hasOwn(args,k)),'参数名必须与工具接口完全一致'));
 checks.push(check('registration',validateRegistration(tool).length===0,'工具规约与已安装函数一致'));
 for(const [i,name]of ports[tool.implementation].entries()){
  const expected=recipe.inputs[i],isList=expected.endsWith('[]'),values=isList?args[name]:[args[name]];
  checks.push(check('type:'+name,Array.isArray(values)&&values.length>0&&values.every(o=>o&&o.type===expected.replace('[]','')),'输入对象类型：'+expected));
  if(Array.isArray(values)&&values.length)checks.push(check('identity:'+name,values.every(o=>o&&run.objects.includes(o)&&o.experimentId===run.task.experimentId),'对象必须来自当前实验及当前运行'));
 }
 if(checks.some(c=>c.status==='violated'))return checks;
 for(const id of tool.requires){const rule=RULES[id];const c=check(id,rule.test(run,args),rule.text);if(rule.evidence)c.evidence=rule.evidence(run,args);checks.push(c);}
 return checks;
}
function execute(impl,a,task){
 const carry=o=>({experimentId:o.experimentId,traceId:o.traceId,role:o.role});
 switch(impl){
 case 'read_trace':return {...carry(a.raw),temperatureC:a.raw.temperatureC,timeUnit:a.raw.timeUnit,rows:clone(a.raw.rows)};
 case 'check_quality':{const p=a.trace.rows;const passed=p.length>=8&&p.every((r,i)=>Number.isFinite(r.time)&&Number.isFinite(r.concentration)&&r.concentration>0&&(i===0||r.time>p[i-1].time));return {...carry(a.trace),passed,points:p.length,issues:passed?[]:['样本、正值或时间顺序不满足要求']};}
 case 'normalize':return {...carry(a.trace),temperatureK:a.trace.temperatureC+273.15,temperatureUnit:'K',timeUnit:'s',qualityPassed:a.quality.passed,rows:a.trace.rows.map(p=>({t:p.time*(a.trace.timeUnit==='min'?60:1),c:p.concentration}))};
 case 'fit_rate':{const f=linearFit(a.curve.rows.map(p=>p.t),a.curve.rows.map(p=>Math.log(p.c)));return {...carry(a.curve),temperatureK:a.curve.temperatureK,temperatureUnit:'K',k:-f.slope,unit:'s^-1',r2:f.r2};}
 case 'fit_rate_robust':{const x=a.curve.rows.map(p=>p.t),y=a.curve.rows.map(p=>Math.log(p.c));const median=v=>{const a=v.sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};const slopes=x.flatMap((v,i)=>x.slice(i+1).map((w,j)=>(y[i+j+1]-y[i])/(w-v)));if(slopes.length<3)throw Error('稳健拟合数据不足');const slope=median(slopes),intercept=median(x.map((v,i)=>y[i]-slope*v)),mean=y.reduce((s,v)=>s+v,0)/y.length,ss=y.reduce((s,v)=>s+(v-mean)**2,0),res=y.reduce((s,v,i)=>s+(v-intercept-slope*x[i])**2,0);return {...carry(a.curve),temperatureK:a.curve.temperatureK,temperatureUnit:'K',k:-slope,unit:'s^-1',r2:ss?1-res/ss:1};}
 case 'aggregate':return {experimentId:task.experimentId,items:clone(a.rates),traceIds:a.rates.map(r=>r.traceId),complete:true};
 case 'fit_arrhenius':{const f=linearFit(a.series.items.map(r=>1/r.temperatureK),a.series.items.map(r=>Math.log(r.k)));return {experimentId:task.experimentId,activationEnergy:-f.slope*R,energyUnit:'J/mol',lnA:f.intercept,r2:f.r2,trainingTraceIds:a.series.traceIds};}
 case 'predict':return {experimentId:task.experimentId,temperatureK:task.holdoutK,k:Math.exp(a.model.lnA-a.model.activationEnergy/(R*task.holdoutK)),unit:'s^-1',modelId:a.model.id};
 case 'validate':{const observed=a.rates.reduce((s,r)=>s+r.k,0)/a.rates.length;const relativeError=Math.abs(a.prediction.k-observed)/observed;return {experimentId:task.experimentId,predictionId:a.prediction.id,modelId:a.prediction.modelId,holdoutTraceIds:a.rates.map(r=>r.traceId),observedK:observed,predictedK:a.prediction.k,relativeError,passed:relativeError<=task.maxRelativeError};}
 case 'report':return {experimentId:task.experimentId,modelId:a.model.id,validationId:a.validation.id,activationEnergy:a.model.activationEnergy,relativeError:a.validation.relativeError,summary:'合成反应动力学分析完成；留出温度预测通过阈值检查。'};
 default:throw Error('未安装函数');
 }
}
function finiteTree(o){if(typeof o==='number')return Number.isFinite(o);if(Array.isArray(o))return o.every(finiteTree);if(o&&typeof o==='object')return Object.values(o).every(finiteTree);return true;}
export function invoke(run,toolId,bindings){
 if(run.status==='completed')throw Error('任务已完成，请新建运行');
 const tool=run.registry.find(t=>t.id===toolId);if(!tool)throw Error('工具未注册');
 const args=Object.fromEntries(Object.entries(bindings).map(([key,val])=>[key,Array.isArray(val)?val.map(id=>run.objects.find(o=>o.id===id)):run.objects.find(o=>o.id===val)]));
 const checks=inspect(run,tool,args),outcome=checks.some(c=>c.status==='violated')?'block':checks.some(c=>c.status==='unknown')?'needs_evidence':'allow';
 const event={id:`call-${++run.sequence}`,toolId,implementation:tool.implementation,name:tool.name,bindings:clone(bindings),checks,outcome,at:new Date().toISOString()};
 if(outcome==='allow'){
  try{const result=execute(tool.implementation,args,run.task);if(!finiteTree(result))throw Error('输出含非有限数值');if(tool.output==='RateEstimate'&&result.k<=0)throw Error('未得到正速率常数');
   const parents=Object.values(bindings).flat();const object={...result,id:`obj-${run.sequence}`,type:tool.output,parents,depth:1+Math.max(0,...parents.map(id=>run.objects.find(o=>o.id===id).depth)),evidence:event.id};
   run.objects.push(object);event.output=object.id;event.execution='succeeded';
   run.executedKeys.push(tool.implementation+':'+JSON.stringify(bindings));
   if(object.type==='ResearchReport')run.status='completed';else run.status='running';
  }catch(e){event.execution='failed';event.error=e.message;run.status='failed';}
 }
 run.events.push(event);return event;
}
export function metrics(run){return {calls:run.events.filter(e=>e.execution==='succeeded').length,blocked:run.events.filter(e=>e.outcome==='block').length,unknown:run.events.filter(e=>e.outcome==='needs_evidence').length,objects:run.objects.length,depth:Math.max(...run.objects.map(o=>o.depth)),completed:run.status==='completed'};}
export function injectProbe(run,kind){
 const find=impl=>run.registry.find(t=>t.implementation===impl)?.id;
 if(kind==='relation'){
  const trace=run.objects.find(o=>o.type==='Trace'),qc=run.objects.find(o=>o.type==='QualityCheck'&&o.traceId!==trace?.traceId);
  if(!trace||!qc)throw Error('请先执行至少两条曲线的质量检查');
  return invoke(run,find('normalize'),{trace:trace.id,quality:qc.id});
 }
 if(kind==='coverage'){const rates=run.objects.filter(o=>o.type==='RateEstimate'&&o.role==='train');if(rates.length<2)throw Error('请先产生至少两个训练速率对象');return invoke(run,find('aggregate'),{rates:rates.slice(0,2).map(r=>r.id)});}
 throw Error('未知检查');
}
// Fresh, separate runs for inspecting constraints; no edits to a user's active run.
export function constraintExamples(){
 const out=[];
 for(const kind of ['relation','coverage','units','unknown']){
  const r=createRun();
  // Explicit fixture setup for diagnostic inputs only. Never used by the agent controller.
  for(const raw of r.objects.filter(o=>o.type==='RawTrace').slice(0,2)){
   const t=invoke(r,'read_trace',{raw:raw.id}).output;
   const q=invoke(r,'check_quality',{trace:t}).output;
   const c=invoke(r,'normalize',{trace:t,quality:q}).output;
   invoke(r,'fit_rate',{curve:c});
  }
  let e;
  if(['relation','coverage'].includes(kind))e=injectProbe(r,kind);
  else{const c=r.objects.find(o=>o.type==='NormalizedTrace');if(kind==='units')c.timeUnit='min';else delete c.qualityPassed;e=invoke(r,'fit_rate',{curve:c.id});}
  out.push({kind,event:e,newObjects:e.output?1:0});
 }
 return out;
}

// The ontology defines admissibility, never the next action. One edge only supplies
// one input port: all other ports and relational conditions still need checking.
export function constraintGraph(registry){
 const nodes=registry.map(t=>({id:t.id,name:t.name,implementation:t.implementation}));
 const edges=[];
 for(const to of registry) for(const [i,type] of to.inputs.entries()) for(const from of registry){
  if(from.output!==type.replace('[]',''))continue;
  edges.push({id:`${from.id}:${to.id}:${ports[to.implementation][i]}`,from:from.id,to:to.id,port:ports[to.implementation][i],type,requires:to.requires,conditions:['对象类型与实验身份匹配',...to.requires.map(id=>RULES[id].text)]});
 }
 return {nodes,edges};
}
export function executionGraph(run){
 const calls=run.events.filter(e=>e.execution==='succeeded'),byCall=new Map(calls.map(e=>[e.id,e])),byObject=new Map(run.objects.map(o=>[o.id,o]));
 const edges=[];
 for(const to of calls)for(const [port,ids] of Object.entries(to.bindings))for(const id of [ids].flat()){
  const from=byCall.get(byObject.get(id)?.evidence);
  if(from)edges.push({from:from.toolId,to:to.toolId,sourceCall:from.id,targetCall:to.id,objectId:id,port});
 }
 return {nodes:[...new Set(calls.map(e=>e.toolId))],edges};
}
export function decisionContext(run){
 const state_index={},calls=new Map(run.events.map(e=>[e.id,e]));
 for(const o of run.objects){const id=o.traceId||o.experimentId;const group=state_index[id]??={identity:id,role:o.role||'experiment',objects_by_type:{}};(group.objects_by_type[o.type]??=[]).push(o.id);}
 return {task:run.task,state_index,context_contract:{state:'objects and state_index are the current authoritative snapshot',feedback:'Only the last four attempts. Each check describes that attempt and its exact input binding, not a persistent fact about the current state.'},ontology:{version:'kinetics/0.1',types:TYPES},
  tools:run.registry.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(t=>({...t,parameters:Object.fromEntries(ports[t.implementation].map((name,i)=>[name,t.inputs[i]])),conditions:t.requires.map(id=>({id,description:RULES[id].text,...(RULES[id].definition?{definition:RULES[id].definition}:{})}))})),
  objects:run.objects.map(o=>{const x=clone(o),event=calls.get(o.evidence);if(event)x.produced_by={tool_id:event.toolId,implementation:event.implementation,call_id:event.id};if(x.items)x.items=x.items.map(r=>({id:r.id,traceId:r.traceId,k:r.k,temperatureK:r.temperatureK}));return x;}),
  feedback:run.events.slice(-4).map(e=>({id:e.id,scope:'only_this_call_and_its_bound_inputs',tool_id:e.toolId,arguments:e.bindings,outcome:e.outcome,execution:e.execution,output:e.output,error:e.error,checks:e.checks.filter(c=>c.status!=='satisfied')}))};
}
export function applyProposal(run,proposal,metadata={}){
 if(!proposal||typeof proposal!=='object')throw Error('模型没有返回有效的工具选择');
 if(proposal.action==='stop'){
  // A model's declaration does not satisfy the task's completion predicate.
  if(run.status!=='completed')run.status='paused';
  run.decisions??=[];run.decisions.push({action:'stop',reason:String(proposal.reason||'').slice(0,1000),...metadata});
  return null;
 }
 const tool=run.registry.find(t=>t.id===proposal.tool_id),b=proposal.arguments;
 let event;
 if(proposal.action!=='call'||!tool||!b||Array.isArray(b)||typeof b!=='object'||Object.values(b).some(v=>typeof v!=='string'&&!(Array.isArray(v)&&v.every(x=>typeof x==='string')))){
  event={id:`call-${++run.sequence}`,toolId:typeof proposal.tool_id==='string'?proposal.tool_id.slice(0,80):'',name:'无效工具提议',bindings:{},checks:[check('proposal',false,'使用已注册工具 ID 和由对象 ID 组成的参数绑定')],outcome:'block',at:new Date().toISOString()};run.events.push(event);
 }else event=invoke(run,tool.id,b);
 event.decision={reason:String(proposal.reason||'').slice(0,1000),...metadata};
 return event;
}

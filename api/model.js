// Keys and upstream addresses are server configuration, never browser input.
export const SYSTEM_PROMPT = `你是科学计算任务的工具编排 Agent。根据任务目标、工具本体规约、已有对象及调用反馈，自己选择下一次调用并绑定参数。
没有预设 workflow，也没有推荐工具顺序。目录按 ID 排序，仅为查询。可以交错处理曲线，可以选择不同速率估计方法；输入必须是当前存在的对象 ID，数组参数必须由你显式选择集合。参数名在 parameters 中。state_index 按曲线身份列出已存在的对象类型与 ID，可用它核对当前状态。conditions.definition 给出结构化条件；exactly_one_per_identity 表示每个要求的身份恰好选一个对象，不是把该身份的所有候选都放进去。反馈 checks.evidence 会列出缺失或重复身份及对应对象 ID。选择哪个候选仍由你决定。objects 和 state_index 是当前状态快照；反馈只解释对应那一次调用及其参数，早先缺失不意味着现在仍缺失，请以当前快照为准。已生成的对象可以直接使用，不要求另一个算法再算一遍。
调用后得到本体检查和真实计算结果。违反条件或缺少证据时不会执行，请据此重新选择。不要编造对象、数值或执行成功。避免无效重复调用。成功以通过验证的目标对象为准，不能用文字宣告成功。
只返回一个 JSON 对象，不要 Markdown：{"action":"call","tool_id":"已注册ID","arguments":{"参数名":"对象ID或对象ID数组"},"reason":"简体中文，不超过80字的选择理由"}。
如果无法继续，返回 {"action":"stop","reason":"具体缺少什么"}。只说明决策依据，不输出内部推理过程。`;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function normalizeEnvironment(env){return {...env,LLM_BASE_URL:env.LLM_BASE_URL||env.DASHSCOPE_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1',LLM_MODEL:env.LLM_MODEL||'qwen-plus',LLM_API_KEY:env.LLM_API_KEY||env.DASHSCOPE_API_KEY};}
export function modelStatus(env){return {configured:!!(env.LLM_BASE_URL&&env.LLM_API_KEY&&env.LLM_MODEL),model:env.LLM_MODEL||null};}
export async function modelAPI(request,env,upstream=fetch){
 env=normalizeEnvironment(env);
 const path=new URL(request.url).pathname;
 if(path==='/api/model-status'&&request.method==='GET')return json(modelStatus(env));
 if(path!=='/api/decide')return json({error:'接口不存在'},404);
 if(request.method!=='POST')return json({error:'需要 POST 请求'},405);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源不匹配'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'需要 JSON 请求'},415);
 if(!modelStatus(env).configured)return json({error:'尚未配置模型连接；请设置服务器端 LLM_BASE_URL、LLM_MODEL、LLM_API_KEY。',code:'MODEL_NOT_CONFIGURED'},503);
 let context;
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();const chunks=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>300000){await reader.cancel();return json({error:'任务上下文超过限制'},413);}chunks.push(value);}
  const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  context=JSON.parse(new TextDecoder().decode(buffer));
  if(!context.task||!context.ontology||!Array.isArray(context.tools)||context.tools.length>30||!Array.isArray(context.objects)||context.objects.length>200||!Array.isArray(context.feedback)||context.feedback.length>100)throw Error();
 }catch{return json({error:'任务上下文格式不正确'},400);}
 let endpoint;
 try{endpoint=new URL(env.LLM_BASE_URL.replace(/\/$/,'')+'/chat/completions');if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error();}
 catch{return json({error:'服务器端模型接口地址无效，需要 HTTPS API 根地址。'},503);}
 try{
  const response=await upstream(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${env.LLM_API_KEY}`},body:JSON.stringify({model:env.LLM_MODEL,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(context)}],stream:false,max_tokens:1600,...(endpoint.hostname.endsWith('aliyuncs.com')?{enable_thinking:false,response_format:{type:'json_object'}}:{})}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});
  // Never forward provider error bodies: they may echo secret configuration.
  if(!response.ok)return json({error:`模型服务返回 HTTP ${response.status}；请检查配置或服务额度。`,code:'MODEL_UPSTREAM_ERROR'},502);
  const result=await response.json();let content=result.choices?.[0]?.message?.content;
  if(typeof content!=='string'||content.length>12000)throw Error('format');
  content=content.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  const decision=JSON.parse(content);
  if(!decision||typeof decision!=='object'||Array.isArray(decision)||!['call','stop'].includes(decision.action)||typeof decision.reason!=='string')throw Error('format');
  decision.reason=decision.reason.slice(0,1000);
  return json({decision,model:env.LLM_MODEL,usage:{prompt_tokens:result.usage?.prompt_tokens,completion_tokens:result.usage?.completion_tokens},at:new Date().toISOString()});
 }catch(e){if(e instanceof SyntaxError||e.message==='format')return json({error:'模型未返回可解析的决策 JSON，运行已暂停。',code:'MODEL_FORMAT_ERROR'},502);if(['ENOTFOUND','EAI_AGAIN','EAI_NONAME'].includes(e.cause?.code))return json({error:'服务器无法解析模型服务域名，请检查服务器出网或代理设置。',code:'MODEL_DNS_ERROR'},502);return json({error:e.name==='TimeoutError'?'模型响应超时，运行已暂停。':e.name==='AbortError'?'模型请求已取消。':'模型响应不是有效决策 JSON，或连接失败；运行已暂停。',code:'MODEL_RESPONSE_ERROR'},502);}
}

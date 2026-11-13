import {decisionContext,applyProposal} from './engine.js';
// Request lifecycle only: no ranking, route search or scripted fallback.
export class AgentController{
 constructor(requestDecision){this.requestDecision=requestDecision;this.epoch=0;this.pending=null;}
 cancel(){this.epoch++;this.pending?.abort();this.pending=null;}
 async step(run){
  if(this.pending)throw Error('已有一次模型决策正在进行');
  if(run.status==='completed')return null;
  if((run.modelRequests||0)>=80)throw Error('已达到本次运行 80 次模型请求上限；请导出记录检查。');
  const epoch=this.epoch,sequence=run.sequence,abort=new AbortController();this.pending=abort;run.modelRequests=(run.modelRequests||0)+1;
  try{
   const result=await this.requestDecision(decisionContext(run),abort.signal);
   if(epoch!==this.epoch||sequence!==run.sequence||abort.signal.aborted)return null;
   return applyProposal(run,result.decision,{model:result.model,usage:result.usage,at:result.at});
  }finally{if(this.pending===abort)this.pending=null;}
 }
}

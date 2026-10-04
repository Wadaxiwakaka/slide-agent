import { join } from 'node:path';
import { z } from 'zod';
import { longformRequestSchema } from '../../domain/longform';
import { outlineSchema } from '../../domain/outline';
import { activeModel,checkJsonRequest,checkLocalRequest,ModelManagementError } from '../manage-models';
import { settingsFile } from '../model-config';
import { JobError,createJob,readJob,deleteJob,expireJobs } from './store';
import { jobStatus,modelFingerprint,stepJob,confirmJobOutline,downloadJob,type JobDeps } from './job';
export const jobDeps:JobDeps={root:join(process.cwd(),'data','longform-jobs'),settingsFile,env:process.env,fetcher:fetch};
export async function readBoundedJson(request:Request,limit=1_048_576):Promise<unknown>{
  const reader=request.body?.getReader();if(!reader)throw new JobError('请求JSON无效');
  const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new JobError('请求超过1 MiB，请缩短材料',413);}parts.push(value);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
  catch(error){if(error instanceof JobError)throw error;throw new JobError('请求JSON无效');}finally{reader.releaseLock();}
}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function handleJobRequest(request:Request,action:'create'|'get'|'delete'|'step'|'outline'|'download',id:string|undefined,deps:JobDeps=jobDeps):Promise<Response>{
  const invalid=request.method==='GET'||request.method==='DELETE'?checkLocalRequest(request):checkJsonRequest(request);
  if(invalid){invalid.headers.set('Cache-Control','no-store');return invalid;}
  try{
    const body=request.method==='GET'||request.method==='DELETE'?null:await readBoundedJson(request);
    await expireJobs(deps.root,deps.now?.()??Date.now());
    if(action==='create'){
      const input=longformRequestSchema.parse(body);const {config}=await activeModel(deps.settingsFile,deps.env);
      const job=await createJob(deps.root,input,config.id,deps.now?.()??Date.now(),modelFingerprint(config));return json({status:jobStatus(job)});
    }
    if(!id||!z.uuid().safeParse(id).success)throw new JobError('任务编号无效');
    if(action==='get'){const job=await readJob(deps.root,id);return json({status:jobStatus(job),input:job.input});}
    if(action==='delete'){await deleteJob(deps.root,id);return json({deleted:true});}
    if(action==='download')return await downloadJob(id,deps);
    const checkpoint=z.string().regex(/^[a-f0-9]{64}$/);
    if(action==='step'){const parsed=z.strictObject({checkpoint}).parse(body);return json({status:await stepJob(id,deps,parsed.checkpoint)});}
    const parsed=z.strictObject({outline:outlineSchema,acceptShortfall:z.boolean(),checkpoint}).parse(body);
    return json({status:await confirmJobOutline(id,parsed.outline,parsed.acceptShortfall,deps,parsed.checkpoint)});
  }catch(error){
    if(error instanceof JobError)return json({error:error.message},error.status);
    if(error instanceof ModelManagementError)return json({error:error.message},400);
    if(error instanceof z.ZodError)return json({error:'任务请求格式无效，请检查材料长度、页数和版本'},400);
    return json({error:'本机任务处理失败，请检查配置或任务状态'},500);
  }
}

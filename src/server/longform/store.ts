import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { longformRequestSchema, type LongformRequest } from '../../domain/longform';
import { outlineSchema } from '../../domain/outline';
import { styleChoiceSchema } from '../../domain/theme';
import { splitSource, sourceChunkSchema, sourceDigestSchema } from './source';
import { storySchema } from './outline';
import { anchoredPageSchema } from './content';

export class JobError extends Error {constructor(message='本机任务不存在或已损坏',public status=400){super(message);}}
export const jobSchema=z.strictObject({
  id:z.uuid(),input:longformRequestSchema,modelConfigId:z.string().min(1),modelFingerprint:z.string(),
  stage:z.enum(['summarize','story','outline','review','content','ready']),cursor:z.number().int().nonnegative(),summaryLevel:z.number().int().nonnegative(),
  chunks:z.array(sourceChunkSchema).max(200_000),digests:z.array(sourceDigestSchema).max(200_000),mergedDigests:z.array(sourceDigestSchema).max(200_000),
  story:storySchema.optional(),outlineParts:z.array(z.array(outlineSchema.shape.slides.element).max(8)).max(100),outline:outlineSchema.optional(),draftOutline:outlineSchema.optional(),acceptedPages:z.number().int().min(1).max(100).optional(),
  completed:z.array(z.array(anchoredPageSchema).max(100)).max(100),suggestedStyle:styleChoiceSchema.exclude(['auto']).nullable().optional(),revision:z.string().regex(/^[a-f0-9]{64}$/),error:z.string().max(500).optional(),updatedAt:z.number().nonnegative(),
});
export type LongformJob=z.infer<typeof jobSchema>;
export function jobRevision(job:Pick<LongformJob,'input'|'outline'|'modelConfigId'|'modelFingerprint'>):string {
  return createHash('sha256').update(JSON.stringify([job.input,job.outline??null,job.modelConfigId,job.modelFingerprint])).digest('hex');
}
const globalLocks=globalThis as typeof globalThis & {slideAgentJobLocks?:Set<string>};
const locks=globalLocks.slideAgentJobLocks??=new Set<string>();
export async function withJobLock<T>(id:string,fn:()=>Promise<T>):Promise<T>{
  if(locks.has(id))throw new JobError('该任务正在处理，请稍后读取状态',409);
  locks.add(id);try{return await fn();}finally{locks.delete(id);}
}
function file(root:string,id:string):string {if(!z.uuid().safeParse(id).success)throw new JobError('任务编号无效');return join(root,id+'.json');}
export async function saveJob(root:string,job:LongformJob):Promise<void>{
  const valid=jobSchema.parse(job);
  if(valid.revision!==jobRevision(valid))throw new JobError('任务版本已改变，请重新确认大纲');
  await mkdir(root,{recursive:true,mode:0o700});
  const destination=file(root,valid.id);const temporary=destination+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,JSON.stringify(valid),{mode:0o600});await rename(temporary,destination);}finally{await rm(temporary,{force:true});}
}
export async function createJob(root:string,input:LongformRequest,modelConfigId:string,now=Date.now(),modelFingerprint=''):Promise<LongformJob>{
  const job:LongformJob={id:randomUUID(),input:longformRequestSchema.parse(input),modelConfigId,modelFingerprint,stage:'summarize',cursor:0,summaryLevel:0,chunks:splitSource(input.sourceText),digests:[],mergedDigests:[],outlineParts:[],completed:[],revision:'',updatedAt:now};
  job.revision=jobRevision(job);await saveJob(root,job);return job;
}
export async function readJob(root:string,id:string):Promise<LongformJob>{
  const path=file(root,id);
  try{const job=jobSchema.parse(JSON.parse(await readFile(path,'utf8')));if(job.id!==id||job.revision!==jobRevision(job))throw new JobError();return job;}catch{throw new JobError();}
}
export async function deleteJob(root:string,id:string):Promise<void>{const path=file(root,id);await withJobLock(id,()=>rm(path,{force:true}));}
export async function expireJobs(root:string,now=Date.now()):Promise<void>{
  await mkdir(root,{recursive:true,mode:0o700});
  for(const name of await readdir(root)){
    const [id,suffix,tempId,end]=name.split('.');
    if(!z.uuid().safeParse(id).success || suffix!=='json' || locks.has(id))continue;
    const isTemp=z.uuid().safeParse(tempId).success && end==='tmp' && name===`${id}.json.${tempId}.tmp`;
    if(name!==id+'.json'&&!isTemp)continue;
    try{
      if(!isTemp){
        try{const job=await readJob(root,id);if(now-job.updatedAt>=7*86_400_000)await deleteJob(root,id);continue;}catch{/* Old damaged snapshots use filesystem age, never execute contents. */}
      }
      const path=join(root,name);if(now-(await stat(path)).mtimeMs>=7*86_400_000)await withJobLock(id,()=>rm(path,{force:true}));
    }catch{/* Another request may have removed the file; cleanup never triggers a model. */}
  }
}

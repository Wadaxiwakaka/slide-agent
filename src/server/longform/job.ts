import { createHash } from 'node:crypto';
import type { Outline } from '../../domain/outline';
import { outlineSchema } from '../../domain/outline';
import { themeForStyle, type StyleId } from '../../domain/theme';
import { renderDeck } from '../../presentation/render';
import { assertEvidence } from '../evidence';
import { activeModel } from '../manage-models';
import { ModelApiError } from '../model-api';
import type { ModelConfig } from '../model-config';
import { summarizeChunk, mergeDigests } from './source';
import { planStory, planOutlineBatch, assembleOutline, sectionSource } from './outline';
import { planDeckBatch, matchesApproved } from './content';
import { readJob, saveJob, withJobLock, jobRevision, JobError, type LongformJob } from './store';

export type JobDeps={root:string;settingsFile:string;env:NodeJS.ProcessEnv;fetcher:typeof fetch;now?:()=>number};
export type JobStatus={id:string;stage:LongformJob['stage'];completed:number;total:number;checkpoint:string;outline?:Outline;supportedPages?:number;reason?:string;actualSlides?:number;error?:string};
export function modelFingerprint(config:ModelConfig):string{return createHash('sha256').update(JSON.stringify(config)).digest('hex');}
export function jobStatus(job:LongformJob):JobStatus{
  return {id:job.id,stage:job.stage,completed:job.stage==='ready'?job.completed.flat().length:job.cursor,total:job.stage==='ready'?job.completed.flat().length:job.stage==='content'?job.cursor+Math.ceil(((job.outline?.slides.length??0)-job.completed.flat().filter(p=>p.continuationIndex===0).length)/8):job.stage==='outline'?job.story?.supportedPages??0:job.stage==='summarize'?(job.summaryLevel?Math.ceil(job.digests.length/8):job.chunks.length):1,checkpoint:createHash('sha256').update(JSON.stringify([job.revision,job.stage,job.summaryLevel,job.cursor,job.outlineParts.length,job.completed.length])).digest('hex'),outline:job.draftOutline??job.outline,supportedPages:job.story?.supportedPages,reason:job.story?.reason,actualSlides:job.stage==='ready'?job.completed.flat().length:undefined,error:job.error};
}
async function model(job:LongformJob,deps:JobDeps){
  const selected=await activeModel(deps.settingsFile,deps.env);const fingerprint=modelFingerprint(selected.config);
  if(selected.config.id!==job.modelConfigId || (job.modelFingerprint && job.modelFingerprint!==fingerprint))throw new JobError('模型配置已改变，请重新规划任务',409);
  job.modelFingerprint=fingerprint;job.revision=jobRevision(job);return selected;
}
function finalPages(job:LongformJob){
  const pages=job.completed.flat();if(pages.length>100)throw new JobError('续页后超过100页，请减少大纲或缩短内容',422);
  if(!job.outline||pages.length===0)throw new JobError('文稿尚未完成',409);
  let offset=0;
  for(const anchor of job.outline.slides){
    const original=pages[offset];if(!original||original.anchorId!==anchor.id||original.continuationIndex!==0||!matchesApproved(original.slide,anchor))throw new JobError('文稿页序或观点校验失败',422);
    offset++;let index=1;while(pages[offset]?.anchorId===anchor.id){if(pages[offset].continuationIndex!==index++)throw new JobError('续页序号无效',422);offset++;}
  }
  if(offset!==pages.length)throw new JobError('文稿包含未确认的页面',422);
  const deck={title:job.outline.title,slides:pages.map(p=>p.slide)};assertEvidence(deck,job.input.sourceText);return deck;
}
export async function stepJob(id:string,deps:JobDeps,expectedCheckpoint?:string):Promise<JobStatus>{
  return withJobLock(id,async()=>{
    const job=await readJob(deps.root,id);if(expectedCheckpoint && jobStatus(job).checkpoint!==expectedCheckpoint)throw new JobError('任务进度已改变，请刷新状态',409);
    const {config,key}=await model(job,deps);
    if(job.stage==='review'||job.stage==='ready')return jobStatus(job);
    try{
      if(job.stage==='summarize'){
        if(job.summaryLevel===0){job.digests.push(await summarizeChunk(job.chunks[job.cursor],config,key,deps.fetcher));job.cursor++;if(job.cursor===job.chunks.length){job.cursor=0;if(job.digests.length<=8)job.stage='story';else job.summaryLevel=1;}}
        else{const batch=job.digests.slice(job.cursor*8,job.cursor*8+8);job.mergedDigests.push(await mergeDigests(batch,config,key,deps.fetcher));job.cursor++;if(job.cursor*8>=job.digests.length){job.digests=job.mergedDigests;job.mergedDigests=[];job.cursor=0;job.summaryLevel++;if(job.digests.length<=8)job.stage='story';}}
      }else if(job.stage==='story'){job.story=await planStory(job.input,job.digests,config,key,deps.fetcher);job.stage='outline';job.cursor=0;}
      else if(job.stage==='outline'){
        const preceding=job.outlineParts.flat();let budget=0;const section=job.story!.sections.find(s=>{budget+=s.pageBudget;return job.cursor<budget;})!;
        const size=Math.min(8,budget-job.cursor);const pages=await planOutlineBatch(section,size,job.input,job.digests,preceding,config,key,deps.fetcher);job.outlineParts.push(pages);job.cursor+=size;
        if(job.cursor===job.story!.supportedPages){job.outline=assembleOutline(job.input,job.outlineParts,job.story!.supportedPages,job.input.sourceText);job.revision=jobRevision(job);job.stage='review';job.cursor=0;}
      }else if(job.stage==='content'){
        const done=job.completed.flat().filter(p=>p.continuationIndex===0).length;
        const selected:Outline['slides']=[];
        // Respect user ordering: shrink the batch, not the source or accepted order.
        const original=job.outlineParts.flat();const sourceSections=new Set<number>();let excerpt='';
        for(const anchor of job.outline!.slides.slice(done,done+8)){
          const index=original.findIndex(p=>p.id===anchor.id);let end=0;
          const sectionIndex=job.story!.sections.findIndex(s=>{end+=s.pageBudget;return index<end;});if(index<0||sectionIndex<0)throw new JobError('大纲来源映射失效');
          const next=new Set([...sourceSections,sectionIndex]);const text=[...next].map(i=>sectionSource(job.story!.sections[i],job.input.sourceText)).join('\n');
          if(text.length>20_004)break;sourceSections.add(sectionIndex);excerpt=text;selected.push(anchor);
        }
        if(!selected.length)throw new JobError('页面材料上下文超出预算',422);
        const fixedStyle:StyleId|undefined=job.completed.length?job.input.styleChoice==='auto'?job.suggestedStyle??'classic':job.input.styleChoice:undefined;
        const result=await planDeckBatch(job.input,selected,excerpt,job.input.sourceText,config,key,deps.fetcher,fixedStyle);
        if(job.completed.length===0)job.suggestedStyle=result.suggestedStyle;
        if(job.completed.flat().length+result.pages.length>100)throw new JobError('续页后超过100页，请减少大纲或缩短内容',422);
        job.completed.push(result.pages);job.cursor++;
        if(done+selected.length===job.outline!.slides.length){finalPages(job);job.stage='ready';}
      }
      job.error=undefined;job.updatedAt=deps.now?.()??Date.now();await saveJob(deps.root,job);return jobStatus(job);
    }catch(error){
      // Keep the last verified checkpoint, never mutated partial work.
      const previous=await readJob(deps.root,id);previous.error=error instanceof JobError||error instanceof ModelApiError?error.message:'本批次处理失败，请检查材料、模型或排版后手动重试（可能收费）';previous.updatedAt=deps.now?.()??Date.now();await saveJob(deps.root,previous);
      throw error instanceof JobError?error:new JobError(previous.error,error instanceof ModelApiError?502:422);
    }
  });
}
export async function saveJobDraft(id:string,outline:Outline,checkpoint:string,deps:JobDeps):Promise<JobStatus>{
  return withJobLock(id,async()=>{
    const job=await readJob(deps.root,id);
    if(jobStatus(job).checkpoint!==checkpoint || !['review','content','ready'].includes(job.stage))throw new JobError('任务进度已改变，请刷新状态',409);
    const draft=outlineSchema.parse(outline);
    if(draft.slides.length>job.story!.supportedPages || draft.slides.some(p=>!job.outlineParts.flat().some(a=>a.id===p.id)))throw new JobError('大纲页面标识不匹配');
    job.draftOutline=draft;job.updatedAt=deps.now?.()??Date.now();await saveJob(deps.root,job);return jobStatus(job);
  });
}
export async function confirmJobOutline(id:string,outline:Outline,acceptShortfall:boolean,deps:JobDeps,expectedCheckpoint?:string):Promise<JobStatus>{
  return withJobLock(id,async()=>{
    const job=await readJob(deps.root,id);await model(job,deps);
    if(expectedCheckpoint && jobStatus(job).checkpoint!==expectedCheckpoint)throw new JobError('大纲版本已改变，请刷新状态',409);
    if(!['review','content','ready'].includes(job.stage))throw new JobError('尚未完成大纲',409);
    const valid=outlineSchema.parse(outline);if(valid.slides.length>job.story!.supportedPages)throw new JobError('大纲页数不匹配');
    const ids=job.outlineParts.flat().map(p=>p.id);if(valid.slides.some(p=>!ids.includes(p.id)))throw new JobError('大纲页面标识不匹配');
    if(valid.slides.length<job.input.slideCount&&!acceptShortfall)throw new JobError('请明确接受较少页数或补充材料');
    assertEvidence(valid,job.input.sourceText);job.outline=valid;job.draftOutline=undefined;job.acceptedPages=valid.slides.length;job.completed=[];job.suggestedStyle=undefined;job.cursor=0;job.stage='content';job.error=undefined;job.revision=jobRevision(job);job.updatedAt=deps.now?.()??Date.now();await saveJob(deps.root,job);return jobStatus(job);
  });
}
export async function downloadJob(id:string,deps:JobDeps):Promise<Response>{
  const job=await readJob(deps.root,id);if(job.stage!=='ready')throw new JobError('文稿尚未完成，不能下载',409);
  const deck=finalPages(job);const styleId=job.input.styleChoice==='auto'?job.suggestedStyle??'classic':job.input.styleChoice;
  const bytes=await renderDeck(deck,themeForStyle(styleId),job.input.density==='detailed'?{minBodySize:16,disableAutoShrink:true}:{});
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','Content-Disposition':'attachment; filename="slide-agent-longform.pptx"','Cache-Control':'no-store','X-SlideAgent-Style':styleId,'X-SlideAgent-Pages':String(deck.slides.length),...(job.input.styleChoice==='auto'&&!job.suggestedStyle?{'X-SlideAgent-Style-Fallback':'1'}:{})}});
}

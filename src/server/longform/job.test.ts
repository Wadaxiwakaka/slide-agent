import { describe,expect,it } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join } from 'node:path';import JSZip from 'jszip';
import { stepJob,confirmJobOutline,downloadJob } from './job';
import { createJob,readJob,saveJob,jobRevision } from './store';import { saveSettings } from '../model-config';import { longformRequestSchema } from '../../domain/longform';
import type { Outline } from '../../domain/outline';
const page=(i:number):Outline['slides'][number]=>({id:`p-${i}`,role:i===0?'opening':'point',layout:i===0?'title':'title_body',title:'主题'+String.fromCharCode(0x4e00+i),keyMessage:'观点'+String.fromCharCode(0x4e00+i)});
async function fixture(target:number,supported=target){
 const root=await mkdtemp(join(tmpdir(),'job-flow-'));const settingsFile=join(root,'models.json');
 await saveSettings(settingsFile,{activeId:'model',models:[{id:'model',name:'Test',protocol:'openai',baseUrl:'https://example.com/v1',modelId:'test',keyAlias:'TEST'}]});
 const input=longformRequestSchema.parse({sourceText:'材料解释与实践案例。',slideCount:target,density:'detailed',styleChoice:'auto'});let offset=0,contentCalls=0,failAt=0;
 const fetcher=(async(_:RequestInfo|URL,init?:RequestInit)=>{
  const prompt=JSON.parse(JSON.parse(String(init?.body)).messages[0].content.split('\n请')[0]);let result:unknown;
  if(prompt.task.includes('归纳'))result={summary:'材料解释与实践'};
  else if(prompt.task.includes('全篇'))result={supportedPages:supported,...(supported<target?{reason:'材料不足'}:{}),sections:[{id:'s',theme:'材料解释',sourceRanges:[[0,input.sourceText.length]],pageBudget:supported}]};
  else if(prompt.task.includes('规划本批')){const size=prompt.schema.properties.slides.minItems;result={slides:Array.from({length:size},(_,i)=>page(offset+i))};offset+=size;}
  else {contentCalls++;if(contentCalls===failAt)return new Response('private-failure',{status:502});result={deck:{title:'报告',slides:prompt.outlinePages.map((p:Outline['slides'][number])=>p.layout==='title'?{layout:p.layout,title:p.title,subtitle:p.keyMessage}:{layout:p.layout,title:p.title,bullets:[p.keyMessage,'解释与案例。']})},styleId:contentCalls===1?'warm':'dark'};}
  return Response.json({choices:[{message:{content:JSON.stringify(result)}}]});
 }) as typeof fetch;
 const deps={root,settingsFile,env:{NODE_ENV:'test' as const,SLIDEAGENT_API_KEY_TEST:'secret-key'},fetcher};const job=await createJob(root,input,'model');
 return {root,deps,job,getCalls:()=>contentCalls,fail:(n:number)=>{failAt=n;}};
}
async function advance(id:string,deps:Parameters<typeof stepJob>[1],stop:string){for(let n=0;n<200;n++){const status=await stepJob(id,deps);if(status.stage===stop)return status;}throw new Error('did not finish');}
describe('recoverable job orchestration',()=>{
 it.each([20,100])('completes %i editable pages and freezes first auto style',async(target)=>{
  const f=await fixture(target);try{
   await expect(downloadJob(f.job.id,f.deps)).rejects.toThrow();const review=await advance(f.job.id,f.deps,'review');
   await confirmJobOutline(f.job.id,review.outline!,false,f.deps);const ready=await advance(f.job.id,f.deps,'ready');
   expect(ready.completed).toBe(target);expect(ready.total).toBe(target);
   const response=await downloadJob(f.job.id,f.deps);expect(response.headers.get('X-SlideAgent-Style')).toBe('warm');
   const zip=await JSZip.loadAsync(await response.arrayBuffer());expect(Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p))).toHaveLength(target);
   expect(f.getCalls()).toBe(Math.ceil(target/8));expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('观点一');
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('rejects concurrent and stale checkpoints without duplicate calls',async()=>{
  const f=await fixture(20);try{
   const start=(await import('./job')).jobStatus(f.job).checkpoint;
   const first=stepJob(f.job.id,f.deps,start);await expect(stepJob(f.job.id,f.deps,start)).rejects.toThrow(/正在/);await first;
   await expect(stepJob(f.job.id,f.deps,start)).rejects.toThrow(/进度/);
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('keeps cross-section user reordering by shrinking content batches to source budget',async()=>{
  const f=await fixture(4);try{
   const job=await readJob(f.root,f.job.id);job.input.sourceText='材'.repeat(20000)+'原'.repeat(5000);job.chunks=(await import('./source')).splitSource(job.input.sourceText);
   job.story={supportedPages:4,sections:[{id:'a',theme:'甲',sourceRanges:[[0,5000],[5000,10000],[10000,15000],[15000,20000]],pageBudget:2},{id:'b',theme:'乙',sourceRanges:[[20000,25000]],pageBudget:2}]};
   job.outlineParts=[[page(0),page(1),page(2),page(3)]];job.outline={title:'材料',slides:job.outlineParts.flat()};job.stage='review';job.revision=jobRevision(job);await saveJob(f.root,job);
   const edited={...job.outline,slides:[page(0),page(2),page(1),page(3)]};await confirmJobOutline(job.id,edited,false,f.deps);
   await advance(job.id,f.deps,'ready');expect(f.getCalls()).toBe(4);
   expect((await readJob(f.root,job.id)).completed.flat().filter(p=>p.continuationIndex===0).map(p=>p.anchorId)).toEqual(edited.slides.map(p=>p.id));
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('honors manual style over model suggestion',async()=>{
  const f=await fixture(2);try{
   const job=await readJob(f.root,f.job.id);job.input.styleChoice='classic';job.revision=jobRevision(job);await saveJob(f.root,job);
   const review=await advance(job.id,f.deps,'review');await confirmJobOutline(job.id,review.outline!,false,f.deps);await advance(job.id,f.deps,'ready');
   expect((await downloadJob(job.id,f.deps)).headers.get('X-SlideAgent-Style')).toBe('classic');
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('allows an explicitly accepted reduced outline to reserve room for continuations',async()=>{
  const f=await fixture(4);try{const s=await advance(f.job.id,f.deps,'review');const reduced={...s.outline!,slides:s.outline!.slides.slice(0,3)};
   await confirmJobOutline(f.job.id,reduced,true,f.deps);await advance(f.job.id,f.deps,'ready');expect((await downloadJob(f.job.id,f.deps)).headers.get('X-SlideAgent-Pages')).toBe('3');
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('requires explicit shortfall acceptance',async()=>{
  const f=await fixture(30,18);try{const s=await advance(f.job.id,f.deps,'review');await expect(confirmJobOutline(f.job.id,s.outline!,false,f.deps)).rejects.toThrow(/接受/);await confirmJobOutline(f.job.id,s.outline!,true,f.deps);}finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('resumes failed batch without repeating completed work',async()=>{
  const f=await fixture(20);try{const s=await advance(f.job.id,f.deps,'review');await confirmJobOutline(f.job.id,s.outline!,false,f.deps);await stepJob(f.job.id,f.deps);f.fail(2);
   await expect(stepJob(f.job.id,f.deps)).rejects.toThrow();expect((await readJob(f.root,f.job.id)).completed).toHaveLength(1);
   await advance(f.job.id,{...f.deps},'ready');expect(f.getCalls()).toBe(4);
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('rejects changed model and 101-page damaged completion without partial download',async()=>{
  const f=await fixture(100);try{const s=await advance(f.job.id,f.deps,'review');await confirmJobOutline(f.job.id,s.outline!,false,f.deps);await advance(f.job.id,f.deps,'ready');
   const job=await readJob(f.root,f.job.id);job.completed.at(-1)!.push({...job.completed.at(-1)!.at(-1)!,continuationIndex:1});await saveJob(f.root,job);await expect(downloadJob(f.job.id,f.deps)).rejects.toThrow(/100/);
   await saveSettings(f.deps.settingsFile,{activeId:'model',models:[{id:'model',name:'Test',protocol:'openai',baseUrl:'https://example.com/v1',modelId:'changed',keyAlias:'TEST'}]});await expect(stepJob(f.job.id,f.deps)).rejects.toThrow(/配置/);
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
});

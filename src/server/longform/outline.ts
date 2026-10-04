import { z } from 'zod';
import { outlineSchema, type Outline } from '../../domain/outline';
import type { LongformRequest } from '../../domain/longform';
import { assertEvidence } from '../evidence';
import { callModel } from '../model-api';
import type { ModelConfig } from '../model-config';
import { sourceDigestSchema, type SourceDigest } from './source';

export const storySchema = z.strictObject({
  supportedPages:z.number().int().min(1).max(100),reason:z.string().trim().min(1).max(400).optional(),
  sections:z.array(z.strictObject({ id:z.string().min(1).max(80),theme:z.string().trim().min(1).max(200),sourceRanges:z.array(z.tuple([z.number().int().nonnegative(),z.number().int().positive()])).min(1).max(4),pageBudget:z.number().int().min(1).max(100) })).min(1).max(100),
});
export type StoryPlan=z.infer<typeof storySchema>;
export class LongformPlanningError extends Error { constructor(){super('模型两次规划无效，请补充材料或更换模型');} }
function rangesValid(section:StoryPlan['sections'][number],source:string):boolean {
  return section.sourceRanges.every(([start,end])=>end>start && end<=source.length && end-start<=5_000);
}
export function sectionSource(section:StoryPlan['sections'][number],source:string):string {
  if(!rangesValid(section,source)) throw new LongformPlanningError();
  return section.sourceRanges.map(([start,end])=>source.slice(start,end)).join('\n');
}
export async function planStory(input:LongformRequest,digests:SourceDigest[],config:ModelConfig,key:string,fetcher:typeof fetch=fetch):Promise<StoryPlan>{
  const valid=z.array(sourceDigestSchema).min(1).max(8).parse(digests);
  const {sourceText,...requirements}=input;
  const prompt=JSON.stringify({task:'从材料摘要规划演示全篇叙事，仅返回schema JSON。资料不足不要凑页；supportedPages可小于目标，此时必须给reason。各节页数之和等于supportedPages，且不超过目标；每节最多4个原文区间、每区间最多5000字符，供后续读取原文。不要外部事实。',requirements,digests:valid,sourceLength:sourceText.length,schema:z.toJSONSchema(storySchema)});
  for(let attempt=0;attempt<2;attempt++){
    const output=await callModel(config,key,prompt+(attempt?'\n请修正结构与原文区间。':''),fetcher);
    try{
      const story=storySchema.parse(JSON.parse(output));
      if(story.supportedPages>input.slideCount || (story.supportedPages<input.slideCount && !story.reason) || story.sections.reduce((sum,s)=>sum+s.pageBudget,0)!==story.supportedPages || new Set(story.sections.map(s=>s.id)).size!==story.sections.length || !story.sections.every(s=>rangesValid(s,sourceText))) throw new LongformPlanningError();
      return story;
    }catch{/* invalid model content only */}
  }
  throw new LongformPlanningError();
}
function uniquePages(pages:Outline['slides']):boolean {
  return new Set(pages.map(p=>p.id)).size===pages.length && new Set(pages.map(p=>p.keyMessage.trim())).size===pages.length;
}
export async function planOutlineBatch(section:StoryPlan['sections'][number],batchSize:number,input:LongformRequest,digests:SourceDigest[],preceding:Outline['slides'],config:ModelConfig,key:string,fetcher:typeof fetch=fetch):Promise<Outline['slides']>{
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>8) throw new LongformPlanningError();
  const excerpt=sectionSource(section,input.sourceText);
  const schema=z.strictObject({slides:z.array(outlineSchema.shape.slides.element).length(batchSize)});
  const {sourceText:_,...requirements}=input; void _;
  const prompt=JSON.stringify({task:'规划本批大纲页，仅返回schema JSON，不补造事实。首批首张必须opening/title，后续不能再次封面；每页独立观点，不重复已讲内容。证据原样复制原文，摘要不作出处。不要坐标。',requirements,section,source:excerpt,digests:digests.slice(-8),preceding:preceding.slice(-8),schema:z.toJSONSchema(schema)});
  for(let attempt=0;attempt<2;attempt++){
    const output=await callModel(config,key,prompt+(attempt?'\n请修正页面结构/重复观点/原文依据。':''),fetcher);
    try{
      const pages=schema.parse(JSON.parse(output)).slides;
      const all=[...preceding,...pages];
      outlineSchema.parse({title:all[0].title,slides:all});
      if(!uniquePages(all))throw new LongformPlanningError();
      assertEvidence({title:all[0].title,slides:pages},input.sourceText);
      return pages;
    }catch{/* content-only retry */}
  }
  throw new LongformPlanningError();
}
export function assembleOutline(input:LongformRequest,batches:Outline['slides'][],supportedPages:number,source:string):Outline{
  const pages=batches.flat();
  if(pages.length!==supportedPages || supportedPages>input.slideCount || !uniquePages(pages))throw new LongformPlanningError();
  const outline=outlineSchema.parse({title:pages[0]?.title,slides:pages});
  assertEvidence(outline,source);return outline;
}

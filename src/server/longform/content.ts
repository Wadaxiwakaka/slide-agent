import { z } from 'zod';
import { deckSchema, type SlideSpec } from '../../domain/deck';
import type { Outline } from '../../domain/outline';
import type { LongformRequest } from '../../domain/longform';
import { styleChoiceSchema, themeForStyle, type StyleId } from '../../domain/theme';
import { paginateDetailedSlide } from '../../presentation/continuation';
import { layoutSlide } from '../../presentation/layout';
import { assertEvidence } from '../evidence';
import { callModel } from '../model-api';
import type { ModelConfig } from '../model-config';

export const anchoredPageSchema = z.strictObject({anchorId:z.string().min(1).max(80),continuationIndex:z.number().int().nonnegative(),slide:deckSchema.shape.slides.element});
export type AnchoredPage = z.infer<typeof anchoredPageSchema>;
function visible(node:unknown):string[]{
  if(typeof node==='string')return [node];
  if(Array.isArray(node))return node.flatMap(visible);
  if(node&&typeof node==='object')return Object.entries(node).flatMap(([field,value])=>field==='sourceQuote'||field==='layout'?[]:visible(value));
  return [];
}
export function matchesApproved(slide:SlideSpec,page:Outline['slides'][number]):boolean {
  return slide.layout===page.layout && slide.title===page.title && visible(slide).some(text=>text.includes(page.keyMessage));
}
export async function planDeckBatch(input:LongformRequest,outlinePages:Outline['slides'],sourceExcerpt:string,fullSource:string,config:ModelConfig,key:string,fetcher:typeof fetch=fetch,fixedStyle?:StyleId):Promise<{pages:AnchoredPage[];suggestedStyle:StyleId|null}>{
  if(outlinePages.length<1||outlinePages.length>8||sourceExcerpt.length>20_004)throw new Error('内容批次大小无效');
  const {sourceText:_,...requirements}=input; void _;
  const prompt=JSON.stringify({task:'按确认大纲生成本批演示内容，仅返回{deck,styleId}，styleId为classic/dark/warm。严格保留每张确认的类型、标题、完整核心观点和顺序。详细模式增加解释与必要例子（假设例子标明示例），多要点而非每页只有一句话；不硬凑字。不能补造数字、日期或事实。sourceQuote只复制原文。不要坐标。',requirements,outlinePages,source:sourceExcerpt,schema:z.toJSONSchema(deckSchema)});
  for(let attempt=0;attempt<2;attempt++){
    const output=await callModel(config,key,prompt+(attempt?'\n上次文稿结构/观点/来源无效，请修正。':''),fetcher);
    try{
      const parsed=JSON.parse(output);
      const deck=deckSchema.parse(parsed.deck);
      if(deck.slides.length!==outlinePages.length || !deck.slides.every((s,i)=>matchesApproved(s,outlinePages[i])))throw new Error('anchor mismatch');
      assertEvidence(deck,fullSource);
      const style=styleChoiceSchema.safeParse(parsed.styleId);
      const suggestedStyle=style.success&&style.data!=='auto'?style.data:null;
      const chosen=fixedStyle??(input.styleChoice==='auto'?suggestedStyle??'classic':input.styleChoice);
      const theme=themeForStyle(chosen);
      const pages=deck.slides.flatMap((slide,i)=>{
        const variants=input.density==='detailed'?paginateDetailedSlide(slide,theme,outlinePages[i].keyMessage):[slide];
        variants.forEach(s=>layoutSlide(s,theme,input.density==='detailed'?{minBodySize:16}:{}));
        return variants.map((s,index)=>({anchorId:outlinePages[i].id,continuationIndex:index,slide:s}));
      });
      return {pages,suggestedStyle};
    }catch{/* content-only retry; transport errors outside */}
  }
  throw new Error('模型两次文稿输出不符合确认的大纲、材料依据或排版容量');
}

import { describe, expect, it } from 'vitest';
import { planStory, planOutlineBatch, assembleOutline } from './outline';
import { longformRequestSchema } from '../../domain/longform';
import type { Outline } from '../../domain/outline';
import type { ModelConfig } from '../model-config';
const config: ModelConfig = { id:'test', name:'Test', protocol:'openai', baseUrl:'https://example.com/v1', modelId:'test', keyAlias:'TEST' };
const input = longformRequestSchema.parse({ sourceText:'2024年项目启动，增长率110%。材料解释与实践案例。', slideCount:30 });
const digests = [{ summary:'项目与实践', sourceRange:[0,input.sourceText.length] as [number,number] }];
const section = { id:'section',theme:'实践',sourceRanges:[digests[0].sourceRange],pageBudget:18 };
const page = (i:number):Outline['slides'][number] => ({id:`p-${i}`,role:i===0?'opening':'point',layout:i===0?'title':'title_body',title:`主题${String.fromCharCode(0x4e00+i)}`,keyMessage:`观点${String.fromCharCode(0x4e00+i)}`});
const reply = (value:unknown) => Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
describe('long-form narrative planning',()=>{
  it('proposes explicit shortfall with source-backed sections',async()=>{
    const story = {supportedPages:18,reason:'资料不足以支持目标页数',sections:[section]};
    expect(await planStory(input,digests,config,'secret',(async()=>reply(story)) as typeof fetch)).toEqual(story);
    let calls=0;
    await expect(planStory(input,digests,config,'secret',(async()=>{calls++;return reply({...story,reason:undefined});}) as typeof fetch)).rejects.toThrow();
    expect(calls).toBe(2);
  });
  it.each([18,100])('assembles %i pages from bounded batches',async(total)=>{
    const request={...input,slideCount:total}; const batches:Outline['slides'][]=[];
    for(let offset=0;offset<total;offset+=8){
      const size=Math.min(8,total-offset); const preceding=batches.flat();
      const result=await planOutlineBatch({...section,pageBudget:total},size,request,digests,preceding,config,'secret',(async(_:RequestInfo|URL,init?:RequestInit)=>{
        expect(String(init?.body)).not.toContain('secret');
        return reply({slides:Array.from({length:size},(_,i)=>page(offset+i))});
      }) as typeof fetch);
      expect(result).toHaveLength(size);batches.push(result);
    }
    expect(assembleOutline(request,batches,total,input.sourceText).slides).toHaveLength(total);
  });
  it.each(['duplicate','number','quote','cover'])('rejects %s in a subsequent batch',async(kind)=>{
    const invalid={...page(1),...(kind==='duplicate'?{keyMessage:page(0).keyMessage}:kind==='number'?{keyMessage:'增长10%'}:kind==='quote'?{role:'evidence',sourceQuotes:['伪造原文']}:{role:'opening',layout:'title'})};
    let calls=0;
    await expect(planOutlineBatch(section,1,input,digests,[page(0)],config,'secret',(async()=>{calls++;return reply({slides:[invalid]});}) as typeof fetch)).rejects.toThrow();
    expect(calls).toBe(2);
  });
  it('rejects unsupported ranges, budgets and 101 assembled pages',async()=>{
    expect(()=>assembleOutline({...input,slideCount:100},[Array.from({length:101},(_,i)=>page(i))],100,input.sourceText)).toThrow();
    await expect(planStory(input,digests,config,'secret',(async()=>reply({supportedPages:18,reason:'材料不足',sections:[{...section,sourceRanges:[[0,999999]]}]})) as typeof fetch)).rejects.toThrow();
    let calls=0;
    await expect(planOutlineBatch(section,9,input,digests,[],config,'secret',(async()=>{calls++;return reply({});}) as typeof fetch)).rejects.toThrow(); expect(calls).toBe(0);
  });
});

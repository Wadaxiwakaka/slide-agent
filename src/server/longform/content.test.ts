import { describe,expect,it } from 'vitest';
import { planDeckBatch } from './content';
import { longformRequestSchema } from '../../domain/longform';
import type { Outline } from '../../domain/outline';
import type { ModelConfig } from '../model-config';
const config:ModelConfig={id:'test',name:'Test',protocol:'openai',baseUrl:'https://example.com/v1',modelId:'test',keyAlias:'TEST'};
const input=longformRequestSchema.parse({sourceText:'材料增长110%。案例与解释。',slideCount:30,density:'detailed'});
const a:Outline['slides'][number]={id:'a',role:'point',layout:'title_body',title:'论点甲',keyMessage:'核心观点甲'};
const b={...a,id:'b',title:'论点乙',keyMessage:'核心观点乙'};
const reply=(value:unknown)=>Response.json({choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value)}}]});
describe('approved content batches',()=>{
  it('preserves reordered non-cover anchors and detailed continuations',async()=>{
    const fetcher=(async()=>reply({deck:{title:'报告',slides:[{layout:'title_body',title:b.title,bullets:[b.keyMessage,...Array(4).fill('解释\n'.repeat(12))]},{layout:'title_body',title:a.title,bullets:[a.keyMessage]}]},styleId:'warm'})) as typeof fetch;
    const result=await planDeckBatch(input,[b,a],input.sourceText,input.sourceText,config,'secret',fetcher);
    expect(result.suggestedStyle).toBe('warm'); expect(result.pages[0].anchorId).toBe('b');expect(result.pages.at(-1)?.anchorId).toBe('a');
    expect(result.pages.filter(p=>p.anchorId==='b').map(p=>p.continuationIndex)).toEqual([0,1,2,3,4]);
  });
  it.each(['title','point','number','json','quote'])('rejects %s with exactly one content retry',async(kind)=>{
    let calls=0;
    const slide=kind==='quote'?{layout:'data_highlight',title:a.title,value:'110%',label:'增长率',takeaway:a.keyMessage,sourceQuote:'假的110%'}:{layout:'title_body',title:kind==='title'?'旧标题':a.title,bullets:[kind==='point'?'偷换观点':kind==='number'?a.keyMessage+'10%':a.keyMessage]};
    await expect(planDeckBatch(input,[kind==='quote'?{...a,layout:'data_highlight'}:a],input.sourceText,input.sourceText,config,'secret',(async()=>{calls++;return reply(kind==='json'?'sensitive-invalid':{deck:{title:'报告',slides:[slide]}});}) as typeof fetch)).rejects.toThrow(/两次/);
    expect(calls).toBe(2);
  });
  it.each([401,429])('does not auto retry HTTP %i',async(status)=>{
    let calls=0;
    await expect(planDeckBatch(input,[a],input.sourceText,input.sourceText,config,'secret',(async()=>{calls++;return new Response('secret',{status});}) as typeof fetch)).rejects.toThrow(String(status));expect(calls).toBe(1);
  });
});

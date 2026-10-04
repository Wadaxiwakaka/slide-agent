import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { paginateDetailedSlide } from './continuation';
import { layoutSlide, LayoutOverflowError } from './layout';
import { renderDeck } from './render';
import { themeForStyle } from '../domain/theme';
import type { SlideSpec } from '../domain/deck';
const detail='解释。'.repeat(30);
const slides:SlideSpec[]=[
  {layout:'title_body',title:'内容',bullets:['核心观点',...Array.from({length:4},(_,i)=>`${String.fromCharCode(0x4e00+i)}\n`+'解释\n'.repeat(12))]},
  {layout:'process',title:'过程',steps:Array.from({length:5},(_,i)=>({heading:String.fromCharCode(0x4e00+i),detail}))},
  {layout:'comparison',title:'对比',left:{heading:'甲',items:[detail,detail,detail]},right:{heading:'乙',items:[detail,detail,detail]}},
];
describe('readable continuation pagination',()=>{
  it.each(['classic','dark','warm'] as const)('paginates dense semantic text in %s',style=>{
    for(const slide of slides){
      const key=slide.layout==='title_body'?slide.bullets[0]:slide.layout==='process'?slide.steps[0].detail:slide.layout==='comparison'?slide.left.items[0]:'';
      const pages=paginateDetailedSlide(slide,themeForStyle(style),key);
      expect(pages.length).toBeGreaterThan(1); expect(pages[0].layout).toBe(slide.layout); expect(pages[0].title).toBe(slide.title);
      for(const page of pages) expect(layoutSlide(page,themeForStyle(style),{minBodySize:16}).filter(e=>e.kind==='text').every(e=>e.size>=16)).toBe(true);
      if(slide.layout==='title_body')expect(pages.flatMap(p=>p.layout==='title_body'?p.bullets:[])).toEqual(slide.bullets);
      if(slide.layout==='process')expect(pages.flatMap(p=>p.layout==='process'?p.steps:[])).toEqual(slide.steps);
      if(slide.layout==='comparison'){
        expect(pages.flatMap(p=>p.layout==='comparison'?p.left.items:[])).toEqual(slide.left.items);
        expect(pages.flatMap(p=>p.layout==='comparison'?p.right.items:[])).toEqual(slide.right.items);
      }
    }
  });
  it('preserves multiline key messages on the anchor',()=>{
    const slide:SlideSpec={layout:'title_body',title:'正文',bullets:['观点\n解释',...Array(4).fill('文字\n'.repeat(12))]};
    expect(paginateDetailedSlide(slide,themeForStyle('classic'),'观点\n解释')[0]).toMatchObject({bullets:['观点\n解释']});
  });
  it('fails safely on an indivisible oversized card',()=>{
    const slide:SlideSpec={layout:'three_cards',title:'卡片',cards:[{heading:'甲',body:'字\n'.repeat(50)},{heading:'乙',body:'文本'},{heading:'丙',body:'文本'}]};
    expect(()=>paginateDetailedSlide(slide,themeForStyle('classic'),'文本')).toThrow(LayoutOverflowError);
  });
  it('writes editable text without autofit shrink in detailed mode',async()=>{
    const slide:SlideSpec={layout:'title_body',title:'详细',bullets:['完整解释与例子']};
    const zip=await JSZip.loadAsync(await renderDeck({title:'详细',slides:[slide]},themeForStyle('classic'),{minBodySize:16,disableAutoShrink:true}));
    const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('完整解释与例子');expect(xml).not.toContain('normAutofit');expect(xml).toContain('<p:sp>');
  });
});

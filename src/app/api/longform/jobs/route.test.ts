import { describe,expect,it } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { handleJobRequest } from '../../../../server/longform/http';
import { saveSettings } from '../../../../server/model-config';
const request=(body:unknown,method='POST',origin='http://localhost:3000')=>new Request('http://localhost:3000/api/longform/jobs',{method,headers:{'Content-Type':'application/json',origin},...(method==='GET'||method==='DELETE'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
async function fixture(){const root=await mkdtemp(join(tmpdir(),'route-job-'));const settingsFile=join(root,'models.json');await saveSettings(settingsFile,{activeId:'model',models:[{id:'model',name:'Test',protocol:'openai',baseUrl:'https://example.com/v1',modelId:'test',keyAlias:'TEST'}]});let calls=0;return {root,deps:{root,settingsFile,env:{NODE_ENV:'test' as const,SLIDEAGENT_API_KEY_TEST:'secret-key'},fetcher:(async()=>{calls++;return new Response('no-real-network',{status:401});}) as typeof fetch},calls:()=>calls};}
describe('bounded local job routes',()=>{
 it('creates, resumes and deletes a local job without automatic paid calls',async()=>{const f=await fixture();try{
  const created=await handleJobRequest(request({sourceText:'私密材料',slideCount:100}), 'create',undefined,f.deps);expect(created.status).toBe(200);const {status}=await created.json();
  const get=await handleJobRequest(request(null,'GET'),'get',status.id,f.deps);expect(get.headers.get('Cache-Control')).toBe('no-store');expect((await get.json()).input.sourceText).toBe('私密材料');expect(f.calls()).toBe(0);
  expect((await handleJobRequest(request(null,'DELETE'),'delete',status.id,f.deps)).status).toBe(200);expect((await handleJobRequest(request(null,'GET'),'get',status.id,f.deps)).status).toBe(400);
 }finally{await rm(f.root,{recursive:true,force:true});}});
 it('limits actual stream bytes independently of content-length',async()=>{const f=await fixture();try{
  const body=JSON.stringify({sourceText:'字'.repeat(180000),extra:' '.repeat(600000),slideCount:100});
  const req=request(body);req.headers.set('Content-Length','1');expect((await handleJobRequest(req,'create',undefined,f.deps)).status).toBe(413);expect(f.calls()).toBe(0);
 }finally{await rm(f.root,{recursive:true,force:true});}});
 it('rejects cross-origin, traversal, wrong type and broken JSON safely',async()=>{const f=await fixture();try{
  expect((await handleJobRequest(request({},'POST','https://evil.example'),'create',undefined,f.deps)).status).toBe(403);
  expect((await handleJobRequest(request(null,'GET'),'get','../secret',f.deps)).status).toBe(400);
  const wrong=request({});wrong.headers.set('Content-Type','text/plain');expect((await handleJobRequest(wrong,'create',undefined,f.deps)).status).toBe(415);
  const broken=await handleJobRequest(request('private-invalid-json'),'create',undefined,f.deps);expect(broken.status).toBe(400);expect(await broken.text()).not.toContain('private-invalid-json');expect(f.calls()).toBe(0);
 }finally{await rm(f.root,{recursive:true,force:true});}});
 it('requires checkpoint and never downloads unfinished data',async()=>{const f=await fixture();try{
  const {status}=await (await handleJobRequest(request({sourceText:'材料',slideCount:30}),'create',undefined,f.deps)).json();
  expect((await handleJobRequest(request({}),'step',status.id,f.deps)).status).toBe(400);
  const failed=await handleJobRequest(request({checkpoint:status.checkpoint}),'step',status.id,f.deps);expect(failed.status).toBe(502);expect(await failed.text()).not.toContain('secret-key');expect(f.calls()).toBe(1);
  expect((await handleJobRequest(request({}),'download',status.id,f.deps)).status).toBe(409);
 }finally{await rm(f.root,{recursive:true,force:true});}});
});

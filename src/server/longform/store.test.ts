import { describe,expect,it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm,utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJob,readJob,saveJob,deleteJob,expireJobs,withJobLock } from './store';
import { longformRequestSchema } from '../../domain/longform';
const input=longformRequestSchema.parse({sourceText:'私密材料',slideCount:30});
describe('local job checkpoints',()=>{
  it('roundtrips immutable revisions and removes a job',async()=>{
    const root=await mkdtemp(join(tmpdir(),'slide-job-'));
    try{
      const job=await createJob(root,input,'model',1000);expect((await readJob(root,job.id)).input.sourceText).toBe('私密材料');
      await saveJob(root,{...job,error:'安全错误'});expect((await readJob(root,job.id)).error).toBe('安全错误');
      await expect(saveJob(root,{...job,input:{...input,sourceText:'新材料'}})).rejects.toThrow(/版本/);
      expect(await readFile(join(root,job.id+'.json'),'utf8')).not.toContain('secret-key');
      await deleteJob(root,job.id);await expect(readJob(root,job.id)).rejects.toThrow(/任务/);
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it('rejects traversal and damaged snapshots without leaking material',async()=>{
    const root=await mkdtemp(join(tmpdir(),'slide-job-'));
    try{
      await expect(readJob(root,'../secret')).rejects.toThrow(/任务/);
      const job=await createJob(root,input,'model');await writeFile(join(root,job.id+'.json'),'private-raw-data');
      await expect(readJob(root,job.id)).rejects.toThrow('本机任务不存在或已损坏');
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it('expires inactive jobs after seven days but preserves active ones',async()=>{
    const root=await mkdtemp(join(tmpdir(),'slide-job-'));const now=1_000_000_000;
    try{
      const old=await createJob(root,input,'model',now-7*86400000);const fresh=await createJob(root,input,'model',now-1000);
      await expireJobs(root,now);await expect(readJob(root,old.id)).rejects.toThrow();expect((await readJob(root,fresh.id)).id).toBe(fresh.id);
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it('cleans abandoned atomic-write materials and old damaged checkpoints',async()=>{
    const root=await mkdtemp(join(tmpdir(),'slide-job-'));const now=Date.now(),oldDate=new Date(now-8*86400000);
    try{
      const job=await createJob(root,input,'model');const path=join(root,job.id+'.json');await writeFile(path,'damaged private material');await utimes(path,oldDate,oldDate);
      const temp=path+'.123e4567-e89b-42d3-a456-426614174000.tmp';await writeFile(temp,'abandoned private material');await utimes(temp,oldDate,oldDate);
      const fresh=temp.replace('123e4567','123e4568');await writeFile(fresh,'recent pending write');
      await expireJobs(root,now);await expect(readFile(path)).rejects.toThrow();await expect(readFile(temp)).rejects.toThrow();expect(await readFile(fresh,'utf8')).toBe('recent pending write');
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it('rejects a concurrent invocation rather than queuing a second paid batch',async()=>{
    let release!:()=>void;let calls=0;const pending=new Promise<void>(r=>{release=r;});
    const first=withJobLock('same',async()=>{calls++;await pending;return 'done';});
    await expect(withJobLock('same',async()=>{calls++;})).rejects.toThrow(/正在/);
    expect(await withJobLock('other',async()=> 'parallel')).toBe('parallel');release();expect(await first).toBe('done');expect(calls).toBe(1);
  });
});

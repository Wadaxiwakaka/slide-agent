import { expect,it,vi } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { createJob,readJob } from './server/longform/store';import { longformRequestSchema } from './domain/longform';import { register } from './instrumentation';
it('cleans expired local snapshots at server startup',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'startup-job-'));const previous=process.cwd();
 try{const root=join(temp,'data','longform-jobs');const old=await createJob(root,longformRequestSchema.parse({sourceText:'材料',slideCount:20}),'model',0);
  vi.spyOn(process,'cwd').mockReturnValue(temp);vi.stubEnv('NEXT_RUNTIME','nodejs');await register();await expect(readJob(root,old.id)).rejects.toThrow();
 }finally{vi.restoreAllMocks();vi.unstubAllEnvs();expect(process.cwd()).toBe(previous);await rm(temp,{recursive:true,force:true});}
});

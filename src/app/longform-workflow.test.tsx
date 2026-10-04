import { expect,it } from 'vitest';
import { estimateLongformCalls } from './longform-workflow';
it('estimates bounded chunk and content calls without fabricating prices',()=>{
 const estimate=estimateLongformCalls(200_000,100);
 expect(estimate.min).toBeGreaterThanOrEqual(67);expect(estimate.max).toBe(estimate.min*2);
 expect(estimateLongformCalls(1_000,5)).toEqual({min:4,max:8});
});

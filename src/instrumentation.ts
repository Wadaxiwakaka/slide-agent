export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { expireJobs } = await import('./server/longform/store');
    const { join } = await import('node:path');
    await expireJobs(join(process.cwd(), 'data', 'longform-jobs'));
  }
}

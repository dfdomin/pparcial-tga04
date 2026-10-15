// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const executor = fs.readFileSync(require('path').join(__dirname, '../js/python-executor.js'), 'utf8');

async function prepare(page) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/**', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.goto('/');
  if (!(await page.evaluate(() => !!window.PPPython))) await page.addScriptTag({url:'/js/python-executor.js'});
}

test('initError rejects instead of hanging and loading can be retried', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    let count=0;
    window.Worker = class extends EventTarget {
      constructor(){ super(); this.n=++count; }
      postMessage(m){ if(m.type==='init') setTimeout(()=>this.onmessage({data:this.n===1?{type:'initError',message:'CDN unavailable'}:{type:'ready'}}),0); }
      terminate(){}
    };
  });
  await page.addScriptTag({content:executor});
  const r=await page.evaluate(async()=>{
    const status=await Promise.race([PPPython.init('source').then(()=> 'wrong success',()=> 'rejected'),new Promise(r=>setTimeout(()=>r('hung'),500))]);
    const retry=status==='rejected'?await PPPython.init('source').then(()=>true):false;
    return {status,retry};
  });
  expect(r).toEqual({status:'rejected',retry:true});
});

test('real runner: external timeout leaves UI responsive and next execution recovers', async ({page})=>{
  await prepare(page);
  const r=await page.evaluate(async()=>{
    await PPPython.init(PY_RUNNER);
    let beats=0; const heartbeat=setInterval(()=>beats++,20), start=performance.now();
    let timeout;try{await PPPython.run('','import time\ntime.sleep(8)',PY_RUNNER);}catch(e){timeout=e.name;}
    const elapsed=performance.now()-start, during=beats;
    const after=await PPPython.run('','print("después ✓")',PY_RUNNER);
    const syntax=await PPPython.run('','x = 1\nprint(X)',PY_RUNNER);
    clearInterval(heartbeat);
    return {timeout,elapsed,during,after,syntax};
  });
  expect(r.timeout).toBe('_PPTimeout');
  expect(r.elapsed).toBeGreaterThan(2500);expect(r.elapsed).toBeLessThan(5000);
  expect(r.during).toBeGreaterThan(30);
  expect(r.after.stdout).toBe('después ✓\n');
  expect(r.syntax.error.type).toBe('NameError');expect(r.syntax.error.line).toBe(2);
});

test('concurrent runs are serialized, isolated and recover after infinite loop',async({page})=>{
  await prepare(page);
  const r=await page.evaluate(async()=>{
    await PPPython.init(PY_RUNNER);
    const pair=await Promise.all([PPPython.run('','import time\ntime.sleep(2)\nprint("uno")',PY_RUNNER),PPPython.run('','import time\ntime.sleep(2)\nprint("dos")',PY_RUNNER)]);
    let infinite;try{const result=await PPPython.run('','while True:\n    pass',PY_RUNNER);infinite=result.error&&result.error.type;}catch(e){infinite=e.name;}
    const after=await PPPython.run('','print("recuperado")',PY_RUNNER);
    return {pair,infinite,after};
  });
  expect(r.pair.map(x=>x.stdout)).toEqual(['uno\n','dos\n']);expect(r.infinite).toBe('_PPTimeout');expect(r.after.stdout).toBe('recuperado\n');
});

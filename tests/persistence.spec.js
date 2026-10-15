const {test,expect}=require('@playwright/test');
const {startExam,routePyodide}=require('./helpers');
const DOC='1043123456',KEY='2026-3:'+DOC;
async function submit(page,code){await page.locator('#codeEditor').fill(code);await page.evaluate(()=>submitAnswer());}
async function correctCode(page){return page.evaluate(()=>'empresa = '+JSON.stringify(examVars.empresa)+'\nprint(empresa)');}
async function resume(page){await page.locator('#docInput').fill(DOC);await page.click('#btnStart');await page.waitForFunction(()=>state.examActive);}

test('reload recovers a saved draft, wrong-answer count and the original deadline',async({page})=>{
 const server=await startExam(page);await submit(page,'print("Otra")');
 await page.locator('#codeEditor').fill('print("borrador sin terminar")');
 await expect.poll(()=>server.sessions.get(KEY).snapshot.drafts[1]).toBe('print("borrador sin terminar")');
 const deadline=server.sessions.get(KEY).deadline_at;
 await page.reload();await resume(page);
 await expect(page.locator('#codeEditor')).toHaveValue('print("borrador sin terminar")');
 await expect(page.locator('#retryCount')).toHaveText('1');
 expect(server.sessions.get(KEY).deadline_at).toBe(deadline);
 expect(await page.evaluate(()=>state.tiempoRestante)).toBeLessThanOrEqual(3000);
});

test('failed submission cannot advance; retry reuses the event without consuming another attempt',async({page})=>{
 const server=await startExam(page);server.fail.pparcial_append_answer=1;
 await submit(page,await correctCode(page));await expect(page.locator('#qNum')).toHaveText('1');
 await expect(page.locator('#btnRetrySave')).toBeVisible();expect(server.sessions.get(KEY).events).toHaveLength(0);
 await page.click('#btnRetrySave');await expect(page.locator('#qNum')).toHaveText('2');
 const calls=server.calls.filter(c=>c.name==='pparcial_append_answer');
 expect(calls).toHaveLength(2);expect(calls[0].args.p_event_id).toBe(calls[1].args.p_event_id);
 expect(server.sessions.get(KEY).events).toHaveLength(1);expect(server.sessions.get(KEY).events[0].p_intentos).toBe(1);
});

test('lost submission ACK is retried idempotently and preserves the next question on reload',async({page})=>{
 const server=await startExam(page);server.loseAck.pparcial_append_answer=1;
 await submit(page,await correctCode(page));expect(server.sessions.get(KEY).events).toHaveLength(1);
 await page.click('#btnRetrySave');await expect(page.locator('#qNum')).toHaveText('2');
 await page.reload();await resume(page);await expect(page.locator('#qNum')).toHaveText('2');
 expect(server.sessions.get(KEY).events).toHaveLength(1);
});

test('offline draft survives reload in this tab and is synced after reconnection',async({page})=>{
 const server=await startExam(page);server.fail.pparcial_save_snapshot=100;
 await page.locator('#codeEditor').fill('empresa = "borrador offline"');
 await expect(page.locator('#btnRetrySave')).toBeVisible();
 await page.reload();await resume(page);
 await expect(page.locator('#codeEditor')).toHaveValue('empresa = "borrador offline"');
 server.fail.pparcial_save_snapshot=0;await expect(page.locator('#btnRetrySave')).toBeVisible();await page.click('#btnRetrySave');
 await expect.poll(()=>server.sessions.get(KEY).snapshot.drafts[1]).toBe('empresa = "borrador offline"');
 expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});

test('final failure never claims delivery; retry confirms an actual numeric zero',async({page})=>{
 const server=await startExam(page);server.fail.pparcial_finalize_session=1;
 await page.evaluate(()=>finishExam());
 await expect(page.getByRole('heading',{name:'📋 Parcial Finalizado'})).toHaveCount(0);
 await expect(page.locator('#btnRetrySave')).toHaveText('Reintentar entrega');
 expect(server.sessions.get(KEY).estado).toBe('en_progreso');
 await page.click('#btnRetrySave');await expect(page.locator('#examLayout')).toContainText('Entrega confirmada por el servidor');
 expect(server.sessions.get(KEY).nota_final).toBe(0);await expect(page.locator('#examLayout')).toContainText('0.0 / 5.0');
});

test('a lost final ACK is verified by reading back the immutable result',async({page})=>{
 const server=await startExam(page);server.loseAck.pparcial_finalize_session=1;
 await page.evaluate(()=>finishExam());await expect(page.locator('#examLayout')).toContainText('Entrega confirmada');
 expect(server.calls.filter(c=>c.name==='pparcial_finalize_session')).toHaveLength(1);
 await page.reload();await page.locator('#docInput').fill(DOC);await page.click('#btnStart');
 await expect(page.locator('#examLayout')).toContainText('0.0 / 5.0');expect(server.sessions.size).toBe(1);
});

test('a correct answer after a wrong one retains full credit',async({page})=>{
 const server=await startExam(page);await submit(page,'print("Otra")');await submit(page,await correctCode(page));
 await expect(page.locator('#qNum')).toHaveText('2');await page.evaluate(()=>finishExam());
 expect(server.sessions.get(KEY).events.map(e=>e.p_puntos)).toEqual([0,1]);
 expect(server.sessions.get(KEY).nota_final).toBe(0.6);
});

test('seven evaluated wrong answers advance once; Python errors do not consume an attempt',async({page})=>{
 const server=await startExam(page);await submit(page,'print(variable_inexistente)');
 expect(server.sessions.get(KEY).events).toHaveLength(0);
 for(let i=0;i<7;i++)await submit(page,'print("Otra")');
 await expect(page.locator('#qNum')).toHaveText('2');
 expect(server.sessions.get(KEY).events).toHaveLength(7);await expect(page.locator('#retryCount')).toHaveText('0');
});

test('skipping is checkpointed before moving and survives reload',async({page})=>{
 const server=await startExam(page);await page.click('#btnSkip');await page.click('#btnSkip');
 await expect(page.locator('#qNum')).toHaveText('2');await page.reload();await resume(page);
 await expect(page.locator('#qNum')).toHaveText('2');expect(server.sessions.get(KEY).events[0].p_intentos).toBe(0);
});

test('server clock offset and three idempotent extensions survive recovery',async({page})=>{
 const server=await routePyodide(page);server.offset=3600000;await startExam(page);
 expect(await page.evaluate(()=>state.tiempoRestante)).toBeGreaterThan(2990);
 for(let n=1;n<=3;n++){
  const deadline=new Date(Date.now()+server.offset-2000).toISOString();server.sessions.get(KEY).deadline_at=deadline;
  await page.evaluate(d=>{state.deadlineAt=Date.parse(d);startTimer();},deadline);
  if(n===1)server.loseAck.pparcial_request_extension=1;
  await page.evaluate(()=>requestExtension());
  if(n===1){await page.click('#btnRetrySave');await expect.poll(()=>page.evaluate(()=>state.pendingExtension)).toBeNull();}
  expect(server.sessions.get(KEY).extensiones_usadas).toBe(n);
 }
 expect(server.sessions.get(KEY).extensions).toHaveLength(3);
 await page.reload();await resume(page);expect(await page.evaluate(()=>state.extensionesUsadas)).toBe(3);
});

test('unavailable backend cannot start a local-only exam',async({page})=>{
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.goto('/');await page.locator('#docInput').fill(DOC);await expect(page.locator('#btnStart')).toBeDisabled();
 await page.evaluate(()=>startExam());expect(await page.evaluate(()=>state.examActive)).toBe(false);
 await expect(page.locator('#accessScreen')).toBeVisible();
});

test('capability tokens and recovery copies are scoped to document and period',async({page})=>{
 await routePyodide(page);await page.goto('/');
 const values=await page.evaluate(()=>{
  const a=ExamPersistence.token('90000001'),again=ExamPersistence.token('90000001'),b=ExamPersistence.token('90000002');
  ExamPersistence.journal('90000001',{snapshot:{drafts:{1:'private draft'}}});
  return {a,again,b,other:ExamPersistence.journal('90000002'),keys:Object.keys(sessionStorage),local:localStorage.length};
 });
 expect(values.a).toBe(values.again);expect(values.a).not.toBe(values.b);expect(values.other).toBeNull();expect(values.local).toBe(0);
 expect(values.keys.every(k=>k.includes('2026-3'))).toBe(true);
});

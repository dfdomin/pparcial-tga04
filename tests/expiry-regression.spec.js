const {test,expect}=require('@playwright/test');
const {startExam}=require('./helpers');
const DOC='1043123456',KEY='2026-3:'+DOC;

test('expired pending answer after third extension requires explicit review delivery and retries safely',async({page})=>{
  const server=await startExam(page);
  const s=server.sessions.get(KEY);
  s.extensiones_usadas=3;s.deadline_at=new Date(Date.now()-1000).toISOString();
  await page.evaluate(d=>{state.extensionesUsadas=3;state.deadlineAt=Date.parse(d);startTimer();},s.deadline_at);
  await page.locator('#codeEditor').fill('print("Otra")');
  await page.evaluate(()=>submitAnswer());
  await expect(page.locator('#btnReviewPending')).toBeVisible();
  expect(s.events).toHaveLength(0);
  server.fail.pparcial_save_snapshot=1;
  await page.click('#btnReviewPending');
  await expect(page.locator('#btnRetrySave')).toHaveText('Reintentar entrega');
  expect(await page.evaluate(()=>state.pendingForReview.codigo)).toBe('print("Otra")');
  server.fail.pparcial_save_snapshot=0;
  await page.click('#btnRetrySave');
  await expect(page.locator('#examLayout')).toContainText('adjunto para revisión técnica');
  expect(s.nota_final).toBe(0);
  expect(s.snapshot.pendingForReview.codigo).toBe('print("Otra")');
  expect(s.snapshot.respuestas).toEqual([]);
});

test('lost ACK of a review delivery is read back as finalized, not trapped in retry',async({page})=>{
 const server=await startExam(page),s=server.sessions.get(KEY);
 s.extensiones_usadas=3;s.deadline_at=new Date(Date.now()-1000).toISOString();
 await page.evaluate(d=>{state.extensionesUsadas=3;state.deadlineAt=Date.parse(d);startTimer();},s.deadline_at);
 await page.locator('#codeEditor').fill('print("pendiente")');await page.evaluate(()=>submitAnswer());
 server.loseAck.pparcial_finalize_session=1;await page.click('#btnReviewPending');
 await expect(page.locator('#examLayout')).toContainText('Entrega confirmada');
 expect(s.snapshot.pendingForReview.codigo).toBe('print("pendiente")');expect(s.nota_final).toBe(0);
});

test('a submission already ACKed by the server is not misclassified as a technical review',async({page})=>{
 const server=await startExam(page),s=server.sessions.get(KEY);
 s.extensiones_usadas=3;await page.evaluate(()=>state.extensionesUsadas=3);
 server.loseAck.pparcial_append_answer=1;
 const code=await page.evaluate(()=>'empresa='+JSON.stringify(examVars.empresa)+'\nprint(empresa)');
 await page.locator('#codeEditor').fill(code);await page.evaluate(()=>submitAnswer());expect(s.events).toHaveLength(1);
 s.deadline_at=new Date(Date.now()-1000).toISOString();await page.evaluate(d=>{state.deadlineAt=Date.parse(d);startTimer();},s.deadline_at);
 await page.evaluate(()=>finishExam());await page.click('#btnReviewPending');
 await expect(page.locator('#examLayout')).toContainText('Entrega confirmada');
 expect(s.snapshot.pendingForReview).toBeUndefined();expect(s.events).toHaveLength(1);expect(s.snapshot.respuestas[0].correcta).toBe(true);
});

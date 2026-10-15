const {test,expect}=require('@playwright/test');
const {routePyodide,startExam,check}=require('./helpers');
async function prepare(page){await routePyodide(page);await page.goto('/');}
async function grade(page,num,output,overrides={}){return page.evaluate(({num,output,overrides})=>{
 examVars=Object.assign(generateExamVars('1043123456'),overrides);return gradeOutput(questions[num-1],output);
},{num,output,overrides});}
async function q9Expected(page){return page.evaluate(()=>{examVars=generateExamVars('1043123456');const p=questions[8].outputMatch(examVars).split('\n');return {total:p[1],avg:p[3]};});}

test('Q9 accepts meaningful labels and either ordering on one or two lines',async({page})=>{
 await prepare(page);const {total,avg}=await q9Expected(page);
 for(const out of [`Ventas acumuladas: ${total}\nMedia mensual: ${avg}`,`Media: ${avg}; Suma: ${total}`,`Total: ${total} — Promedio: ${avg}`,`Suma total: ${total} | Media aritmética: ${avg}`,`Total Q2: ${total}\nPromedio Q2: ${avg}`])expect((await grade(page,9,out)).ok,out).toBe(true);
});

test('Q9 rejects swapped associations, missing labels and contradictory repeated labels',async({page})=>{
 await prepare(page);const {total,avg}=await q9Expected(page);
 for(const out of [`Total: ${avg}\nPromedio: ${total}`,`${total}\n${avg}`,`Total: ${total};Promedio: ${avg};Total: 999999`,`Intermediario: ${avg}\nTotal: ${total}`])expect((await grade(page,9,out)).ok,out).toBe(false);
});

test('numeric results accept conventional decimal/thousands forms, never a substring or concatenated lines',async({page})=>{
 await prepare(page);
 const r=await page.evaluate(()=>{
  const g=(expected,out,num=4)=>PPGrading.grade({num,outputMatch:()=>String(expected)},out,{}).ok;
  return [g(1234567,'1.234.567'),g(1234567,'1,234,567'),g(45000,'45.000'),g(45000,'45,000'),g(45000,'45'),g(95,'195'),g(9540,'95\n40'),g(9540,'95 40'),g(12,'12,34,56')];
 });expect(r).toEqual([true,true,true,true,false,false,false,false,false]);
});

test('Q6 accepts comma decimals and full Python precision, not a thousands-fold error',async({page})=>{
 await prepare(page);const v={ventas_ene:70,ventas_feb:71,ventas_mar:73};
 for(const out of ['Promedio: 71,33','71.333','71,333','71.3'])expect((await grade(page,6,out,v)).ok,out).toBe(true);
 for(const out of ['71333','71.4','214'])expect((await grade(page,6,out,v)).ok,out).toBe(false);
});

test('Q2 requires company plus descriptive text, without prescribing Empresa',async({page})=>{
 await prepare(page);
 expect((await grade(page,2,'Organización seleccionada: Acme',{empresa:'Acme'})).ok).toBe(true);
 expect((await grade(page,2,'Acme',{empresa:'Acme'})).ok).toBe(false);
 expect((await grade(page,2,'Empresa: Otra',{empresa:'Acme'})).ok).toBe(false);
});

test('Q7 accepts unlabeled values in stated order and labeled values in either order',async({page})=>{
 await prepare(page);const v={ventas_ene:72,ventas_feb:59,ventas_mar:83};
 for(const out of ['83\n59','83 59','Mayor: 83\nMenor: 59','Mínimo: 59; Máximo: 83'])expect((await grade(page,7,out,v)).ok,out).toBe(true);
 for(const out of ['59\n83','Mayor: 59\nMenor: 83','marzo\nfebrero','83'])expect((await grade(page,7,out,v)).ok,out).toBe(false);
});

test('Q8 checks execution evidence without imposing variable names; a literal answer is not an algorithm',async({page})=>{
 await startExam(page);const v=await page.evaluate(()=>examVars),want=v.pago_con-v.total_compra;
 expect((await check(page,8,`print(${want})`)).ok).toBe(false);
 expect((await check(page,8,`importe=${v.total_compra}\nefectivo=${v.pago_con}\ncambio=efectivo-importe\nprint(cambio)`)).ok).toBe(true);
 expect((await check(page,8,`total_compra=${v.total_compra}\npago_con=${v.pago_con}\nprint(pago_con + (-total_compra))`)).ok).toBe(true);
});

test('grader/hints stay compatible for all nine questions and reject clearly wrong output',async({page})=>{
 await prepare(page);
 const checks=await page.evaluate(()=>{examVars=generateExamVars('1043123456');return questions.map(q=>{
  const verdict=gradeOutput(q,'not an answer');return {ok:verdict.ok,hint:wrongAnswerHint(q,verdict,'not an answer','print("not an answer")'),partsAreStrings:verdict.parts.every(x=>typeof x==='string'),indices:verdict.missing.every(Number.isInteger)};
 });});
 for(const r of checks){expect(r.ok).toBe(false);expect(r.hint).toBeTruthy();expect(r.partsAreStrings).toBe(true);expect(r.indices).toBe(true);}
});

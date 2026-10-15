const fs = require('fs');
const path = require('path');
const fixtures = new WeakMap();

// This server exists ONLY in the Playwright process. Production has no test/local bypass.
async function routePyodide(page) {
  if (fixtures.has(page)) return fixtures.get(page);
  const server={sessions:new Map(),calls:[],fail:{},loseAck:{},offset:0};
  fixtures.set(page,server);
  page.on('dialog',d=>d.accept());
  await page.route('https://btrsgwkwiucuoittshop.supabase.co/**',r=>r.abort());
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'application/javascript',body:`
    window.supabase={createClient:function(){return {
      rpc:function(name,args){return fetch('/__qa/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,args})}).then(r=>r.json());},
      from:function(){var doc='';return {select:function(){return this;},eq:function(k,v){if(k==='documento')doc=v;return this;},maybeSingle:function(){return Promise.resolve({data:doc==='00000'?null:{nombre:'Estudiante de prueba',grupo:'QA',horario:'QA',periodo:'2026-3'},error:null});}};}
    };}};`}));
  const clone=x=>JSON.parse(JSON.stringify(x));
  const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/002_reliable_sessions.sql'),'utf8');
  const signatures=new Map([...migration.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([^)]*)\)/g)].map(m=>[m[1],m[2].split(',').map(a=>a.trim().split(/\s+/)[0])]));
  const now=()=>Date.now()+server.offset;
  await page.route('**/__qa/rpc',async route=>{
    const {name,args:a}=route.request().postDataJSON();server.calls.push({name,args:clone(a)});
    let data;
    try{
      if(!signatures.has(name)||Object.keys(a).some(key=>!signatures.get(name).includes(key)))throw Error('PGRST202: RPC argument mismatch');
      if(server.fail[name]){server.fail[name]--;throw Error('NETWORK_TEST_FAILURE');}
      const key=a.p_periodo+':'+a.p_documento;let s=server.sessions.get(key);
      function reply(){return {...clone(s),server_now:new Date(now()).toISOString()};}
      if(name==='pparcial_begin_session'){
        if(a.p_periodo!=='2026-3'||a.p_documento==='00000')throw Error('STUDENT_NOT_ENROLLED');
        if(!s){s={documento:a.p_documento,nombre:'Estudiante de prueba',token:a.p_session_token,estado:'en_progreso',revision:0,deadline_at:new Date(now()+3000000).toISOString(),extensiones_usadas:0,snapshot:{preguntaActual:1,respuestas:[],drafts:{},retryCount:0,penalSalidas:0},events:[],extensions:[]};server.sessions.set(key,s);}
        if(s.token!==a.p_session_token)throw Error('SESSION_IN_USE');data=reply();
      }else{
        if(!s||s.token!==a.p_session_token)throw Error('SESSION_INVALID');
        if(name==='pparcial_save_snapshot'){
          if(s.estado==='finalizado')throw Error('SESSION_FINISHED');
          if(s.revision!==a.p_revision)throw Error('REVISION_CONFLICT');s.snapshot=clone(a.p_snapshot);s.revision++;data=reply();
        }else if(name==='pparcial_append_answer'){
          if(s.events.some(e=>e.p_event_id===a.p_event_id)){data=reply();}
          else{
            if(s.estado==='finalizado')throw Error('SESSION_FINISHED');
            if(now()>=Date.parse(s.deadline_at))throw Error('TIME_EXPIRED');
            const prior=s.events.filter(e=>e.p_pregunta_num===a.p_pregunta_num),last=prior[prior.length-1];
            if(last&&(last.p_correcta||last.p_intentos===0||last.p_intentos===7))throw Error('QUESTION_FINISHED');
            if(a.p_intentos>0&&a.p_intentos!==prior.length+1)throw Error('ATTEMPT_LIMIT');
            s.events.push(clone(a));s.snapshot=clone(a.p_snapshot);s.revision++;data=reply();
          }
        }else if(name==='pparcial_finalize_session'){
          if(s.estado!=='finalizado'){
            if(s.revision!==a.p_revision)throw Error('REVISION_CONFLICT');
            const last=new Map();s.events.forEach(e=>last.set(e.p_pregunta_num,e));
            const correct=[...last.values()].filter(e=>e.p_correcta).length;
            s.nota_final=Math.max(0,Math.round((correct*5/9-s.extensiones_usadas*.5-(s.snapshot.penalSalidas||0)*.1)*10)/10);
            s.estado='finalizado';s.revision++;
          }data=reply();
        }else if(name==='pparcial_request_extension'){
          if(!s.extensions.includes(a.p_event_id)){
            if(s.extensiones_usadas>=3)throw Error('EXTENSION_LIMIT');if(now()<Date.parse(s.deadline_at))throw Error('TIME_NOT_EXPIRED');
            s.extensions.push(a.p_event_id);s.extensiones_usadas++;s.deadline_at=new Date(now()+300000).toISOString();s.revision++;
          }data=reply();
        }else throw Error('UNKNOWN_TEST_RPC');
      }
      if(server.loseAck[name]){server.loseAck[name]--;throw Error('NETWORK_ACK_LOST');}
      await route.fulfill({json:{data,error:null}});
    }catch(e){await route.fulfill({json:{data:null,error:{message:e.message}}});}
  });
  if(process.env.PYODIDE_DIR){
    const dir=process.env.PYODIDE_DIR;
    await page.context().route('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/**',route=>{
      const file=path.join(dir,new URL(route.request().url()).pathname.split('/').pop());
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const contentType=file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':'application/octet-stream';
      return route.fulfill({body:fs.readFileSync(file),contentType,headers:{'access-control-allow-origin':'*'}});
    });
  }
  return server;
}
async function startExam(page,doc='1043123456'){
  await page.setViewportSize({width:1280,height:800});
  const backend=await routePyodide(page);
  await page.goto('/');await page.locator('#docInput').fill(doc);await page.click('#btnStart');
  await page.waitForFunction(()=>state.examActive===true);await page.evaluate(()=>initPy());
  return backend;
}
async function check(page,qNum,code){return page.evaluate(async({qNum,code})=>{
  const res=await executeStudentCode(qNum,code),txt=(res.stdout||'').trim();
  const verdict=gradeOutput(questions[qNum-1],txt,code,res.analysis);
  return {stdout:res.stdout,error:res.error,autofix:res.autofix,ok:!res.error&&verdict.ok,tip:res.error?explainError(res.error):'',hint:!res.error&&!verdict.ok&&txt?wrongAnswerHint(questions[qNum-1],verdict,txt,code):''};
},{qNum,code});}
module.exports={routePyodide,startExam,check};

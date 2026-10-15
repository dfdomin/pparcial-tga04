-- Synthetic fixtures only. This script always rolls back; never replace ROLLBACK with COMMIT.
BEGIN;
DO $qa$
DECLARE d jsonb; original_deadline text; doc text:='900000000009'; tok uuid:='00000000-0000-4000-8000-000000000009'; ev uuid:='00000000-0000-4000-8000-000000000019'; revision_now bigint; n integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.pparcial_estudiantes WHERE documento=doc) THEN RAISE EXCEPTION 'QA_DOCUMENT_COLLISION'; END IF;
 INSERT INTO public.pparcial_estudiantes(id,documento,nombre,grupo,periodo) VALUES(-900009,doc,'QA transaction only','QA','2026-3');
 BEGIN
  PERFORM public.pparcial_begin_session('not-enrolled','2026-3',tok,NULL,'{}');
  RAISE EXCEPTION 'QA: unregistered student accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STUDENT_NOT_ENROLLED' THEN RAISE; END IF; END;
 d=public.pparcial_begin_session(doc,'2026-3',tok,NULL,'{}'); original_deadline=d->>'deadline_at';
 ASSERT d->>'estado'='en_progreso';
 d=public.pparcial_begin_session(doc,'2026-3',tok,NULL,'{}'); ASSERT d->>'deadline_at'=original_deadline;
 BEGIN
  PERFORM public.pparcial_begin_session(doc,'2026-3','00000000-0000-4000-8000-000000000099',NULL,'{}');
  RAISE EXCEPTION 'QA: wrong token accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SESSION_IN_USE' THEN RAISE; END IF; END;
 d=public.pparcial_save_snapshot(doc,'2026-3',tok,0,'{"preguntaActual":1,"drafts":{"1":"print(123)"},"penalSalidas":0}'); ASSERT (d->>'revision')::bigint=1;
 BEGIN
  PERFORM public.pparcial_save_snapshot(doc,'2026-3',tok,0,'{}'); RAISE EXCEPTION 'QA: stale snapshot accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REVISION_CONFLICT' THEN RAISE; END IF; END;
 d=public.pparcial_append_answer(doc,'2026-3',tok,ev,1,true,0.1,1,'print("example")','{"preguntaActual":2,"penalSalidas":0,"respuestas":[{"correcta":true}]}');
 revision_now=(d->>'revision')::bigint;
 UPDATE public.pparcial_sesiones SET deadline_at=clock_timestamp()-interval '1 second' WHERE documento=doc;
 BEGIN
  PERFORM public.pparcial_append_answer(doc,'2026-3',tok,'00000000-0000-4000-8000-000000000088',2,true,1,1,'late','{}'); RAISE EXCEPTION 'QA: late new answer accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TIME_EXPIRED' THEN RAISE; END IF; END;
 d=public.pparcial_append_answer(doc,'2026-3',tok,ev,1,false,0,1,'changed','{}'); ASSERT (d->>'revision')::bigint=revision_now;
 SELECT count(*) INTO n FROM public.pparcial_respuestas WHERE documento=doc; ASSERT n=0;
 SELECT count(*) INTO n FROM public.pparcial_respuestas_sesion a JOIN public.pparcial_sesiones s ON s.id=a.sesion_id WHERE s.documento=doc; ASSERT n=1;
 ASSERT (SELECT puntos FROM public.pparcial_respuestas_sesion a JOIN public.pparcial_sesiones s ON s.id=a.sesion_id WHERE s.documento=doc)=1;
 d=public.pparcial_finalize_session(doc,'2026-3',tok,revision_now,99,'[]','{}'); ASSERT abs((d->>'nota_final')::numeric-0.6)<0.0001;
 d=public.pparcial_finalize_session(doc,'2026-3',tok,0,0,'[]','{}'); ASSERT abs((d->>'nota_final')::numeric-0.6)<0.0001;
 ASSERT abs((SELECT nota_final::numeric FROM public.pparcial_intentos WHERE documento=doc)-0.6)<0.0001;
 BEGIN
  PERFORM public.pparcial_save_snapshot(doc,'2026-3',tok,revision_now,'{}'); RAISE EXCEPTION 'QA: finalized changed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SESSION_FINISHED' THEN RAISE; END IF; END;
 ASSERT NOT has_table_privilege('anon','public.pparcial_sesiones','SELECT');
 ASSERT NOT has_table_privilege('anon','public.pparcial_respuestas_sesion','INSERT');
 -- Second fixture: zero preserved, idempotent extension, limits, preexisting history untouched.
 doc='900000000008';tok='00000000-0000-4000-8000-000000000008';
 IF EXISTS(SELECT 1 FROM public.pparcial_estudiantes WHERE documento=doc) THEN RAISE EXCEPTION 'QA_DOCUMENT_COLLISION'; END IF;
 INSERT INTO public.pparcial_estudiantes(id,documento,nombre,grupo,periodo) VALUES(-900008,doc,'QA transaction only','QA','2026-3');
 INSERT INTO public.pparcial_intentos(id,documento,nombre,estado,nota_final) VALUES(-900008,doc,'Historical QA','finalizado',4.5);
 d=public.pparcial_begin_session(doc,'2026-3',tok,NULL,'{}');
 FOR n IN 1..3 LOOP
  UPDATE public.pparcial_sesiones SET deadline_at=clock_timestamp()-interval '1 second' WHERE documento=doc;
  ev=('00000000-0000-4000-8000-00000000010'||n)::uuid;
  d=public.pparcial_request_extension(doc,'2026-3',tok,ev); ASSERT (d->>'extensiones_usadas')::integer=n;
  d=public.pparcial_request_extension(doc,'2026-3',tok,ev); ASSERT (d->>'extensiones_usadas')::integer=n;
 END LOOP;
 BEGIN
  PERFORM public.pparcial_request_extension(doc,'2026-3',tok,'00000000-0000-4000-8000-000000000104'); RAISE EXCEPTION 'QA: fourth extension accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'EXTENSION_LIMIT' THEN RAISE; END IF; END;
 revision_now=(d->>'revision')::bigint;
 d=public.pparcial_finalize_session(doc,'2026-3',tok,revision_now,5,'[]','{}');ASSERT (d->>'nota_final')::real=0;
 ASSERT (SELECT nota_final FROM public.pparcial_sesiones WHERE documento=doc)=0;
 ASSERT (SELECT nota_final FROM public.pparcial_intentos WHERE documento=doc)=4.5;
 -- Third fixture: seven failed submissions cannot become an eighth; other eight correct questions retain full value.
 doc='900000000007';tok='00000000-0000-4000-8000-000000000007';
 IF EXISTS(SELECT 1 FROM public.pparcial_estudiantes WHERE documento=doc) THEN RAISE EXCEPTION 'QA_DOCUMENT_COLLISION'; END IF;
 INSERT INTO public.pparcial_estudiantes(id,documento,nombre,grupo,periodo) VALUES(-900007,doc,'QA transaction only','QA','2026-3');
 d=public.pparcial_begin_session(doc,'2026-3',tok,NULL,'{}');
 FOR n IN 1..7 LOOP
  ev=('00000000-0000-4000-8000-00000000020'||n)::uuid;
  d=public.pparcial_append_answer(doc,'2026-3',tok,ev,1,false,1,n,'wrong','{"preguntaActual":2,"penalSalidas":0}');
 END LOOP;
 BEGIN
  PERFORM public.pparcial_append_answer(doc,'2026-3',tok,'00000000-0000-4000-8000-000000000208',1,true,1,8,'eighth','{}'); RAISE EXCEPTION 'QA: eighth submission accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN ('ANSWER_INVALID','QUESTION_FINISHED','ATTEMPT_LIMIT') THEN RAISE; END IF; END;
 FOR n IN 2..9 LOOP
  ev=('00000000-0000-4000-8000-00000000030'||n)::uuid;
  d=public.pparcial_append_answer(doc,'2026-3',tok,ev,n,true,0,1,'correct','{"preguntaActual":9,"penalSalidas":0}');
 END LOOP;
 d=public.pparcial_finalize_session(doc,'2026-3',tok,(d->>'revision')::bigint,0,'[]','{}');
 ASSERT abs((d->>'nota_final')::numeric-4.4)<0.0001;
END;
$qa$;
ROLLBACK;

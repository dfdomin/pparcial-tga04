-- Reliable TGA04 sessions. Additive only: no historical records are updated or deleted.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pparcial_sesiones (
 id bigserial PRIMARY KEY,
 documento text NOT NULL, periodo text NOT NULL, session_token uuid NOT NULL UNIQUE,
 nombre text NOT NULL, estado text NOT NULL DEFAULT 'en_progreso' CHECK (estado IN ('en_progreso','finalizado')),
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, revision bigint NOT NULL DEFAULT 0,
 deadline_at timestamptz NOT NULL, extensiones_usadas integer NOT NULL DEFAULT 0 CHECK (extensiones_usadas BETWEEN 0 AND 3),
 extension_events uuid[] NOT NULL DEFAULT '{}',
 nota_final real CHECK (nota_final BETWEEN 0 AND 5),
 creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(), finalizado_en timestamptz,
 UNIQUE (documento, periodo)
);
CREATE TABLE IF NOT EXISTS public.pparcial_respuestas_sesion (
 id bigserial PRIMARY KEY, sesion_id bigint NOT NULL REFERENCES public.pparcial_sesiones(id),
 evento_id uuid NOT NULL, pregunta_num integer NOT NULL CHECK (pregunta_num BETWEEN 1 AND 9),
 correcta boolean NOT NULL, puntos real NOT NULL CHECK (puntos IN (0,1)),
 intentos integer NOT NULL CHECK (intentos BETWEEN 0 AND 7), codigo text NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT now(), UNIQUE (sesion_id, evento_id)
);
ALTER TABLE public.pparcial_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pparcial_respuestas_sesion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pparcial_sesiones,public.pparcial_respuestas_sesion FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.pparcial_sesiones_id_seq,public.pparcial_respuestas_sesion_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pparcial_begin_session(p_documento text,p_periodo text,p_session_token uuid,p_nombre text DEFAULT NULL,p_snapshot jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.pparcial_sesiones%ROWTYPE; student_name text;
BEGIN
 IF p_session_token IS NULL OR p_periodo<>'2026-3' THEN RAISE EXCEPTION 'SESSION_INVALID'; END IF;
 SELECT e.nombre INTO student_name FROM public.pparcial_estudiantes e WHERE e.documento=p_documento AND e.periodo=p_periodo;
 IF NOT FOUND THEN RAISE EXCEPTION 'STUDENT_NOT_ENROLLED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_periodo||':'||p_documento,0));
 SELECT x.* INTO s FROM public.pparcial_sesiones x WHERE x.documento=p_documento AND x.periodo=p_periodo FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.pparcial_sesiones(documento,periodo,session_token,nombre,deadline_at,snapshot)
  VALUES(p_documento,p_periodo,p_session_token,student_name,clock_timestamp()+interval '50 minutes',jsonb_build_object('preguntaActual',1,'respuestas','[]'::jsonb,'drafts','{}'::jsonb,'retryCount',0,'penalSalidas',0)) RETURNING * INTO s;
 ELSIF s.session_token<>p_session_token THEN RAISE EXCEPTION 'SESSION_IN_USE'; END IF;
 RETURN (to_jsonb(s)-'session_token'-'extension_events')||jsonb_build_object('server_now',clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.pparcial_save_snapshot(p_documento text,p_periodo text,p_session_token uuid,p_revision bigint,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.pparcial_sesiones%ROWTYPE;
BEGIN
 SELECT x.* INTO s FROM public.pparcial_sesiones x WHERE x.documento=p_documento AND x.periodo=p_periodo AND x.session_token=p_session_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_INVALID'; END IF;
 IF s.estado='finalizado' THEN RAISE EXCEPTION 'SESSION_FINISHED'; END IF;
 IF p_revision IS NULL OR p_revision<>s.revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object' OR octet_length(p_snapshot::text)>262144 THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 -- Drafts may be backed up after expiry; they do not count as submitted answers.
 UPDATE public.pparcial_sesiones x SET snapshot=p_snapshot,revision=x.revision+1,actualizado_en=clock_timestamp() WHERE x.id=s.id RETURNING x.* INTO s;
 RETURN jsonb_build_object('revision',s.revision,'server_now',clock_timestamp(),'deadline_at',s.deadline_at,'extensiones_usadas',s.extensiones_usadas);
END $$;

CREATE OR REPLACE FUNCTION public.pparcial_append_answer(p_documento text,p_periodo text,p_session_token uuid,p_event_id uuid,p_pregunta_num integer,p_correcta boolean,p_puntos real,p_intentos integer,p_codigo text,p_snapshot jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.pparcial_sesiones%ROWTYPE; last_answer public.pparcial_respuestas_sesion%ROWTYPE; attempts integer;
BEGIN
 SELECT x.* INTO s FROM public.pparcial_sesiones x WHERE x.documento=p_documento AND x.periodo=p_periodo AND x.session_token=p_session_token FOR UPDATE;
 IF NOT FOUND OR p_event_id IS NULL THEN RAISE EXCEPTION 'SESSION_INVALID'; END IF;
 -- Check duplicates before deadline/final state: a lost ACK must remain retryable.
 IF EXISTS(SELECT 1 FROM public.pparcial_respuestas_sesion a WHERE a.sesion_id=s.id AND a.evento_id=p_event_id) THEN
  RETURN jsonb_build_object('ok',true,'revision',s.revision,'server_now',clock_timestamp(),'duplicate',true);
 END IF;
 IF s.estado='finalizado' THEN RAISE EXCEPTION 'SESSION_FINISHED'; END IF;
 IF clock_timestamp()>=s.deadline_at THEN RAISE EXCEPTION 'TIME_EXPIRED'; END IF;
 IF p_pregunta_num IS NULL OR p_pregunta_num NOT BETWEEN 1 AND 9 OR p_intentos IS NULL OR p_intentos NOT BETWEEN 0 AND 7 OR p_correcta IS NULL THEN RAISE EXCEPTION 'ANSWER_INVALID'; END IF;
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object' OR octet_length(p_snapshot::text)>262144 OR length(coalesce(p_codigo,''))>50000 THEN RAISE EXCEPTION 'ANSWER_TOO_LARGE'; END IF;
 SELECT a.* INTO last_answer FROM public.pparcial_respuestas_sesion a WHERE a.sesion_id=s.id AND a.pregunta_num=p_pregunta_num ORDER BY a.id DESC LIMIT 1;
 IF FOUND AND (last_answer.correcta OR last_answer.intentos IN (0,7)) THEN RAISE EXCEPTION 'QUESTION_FINISHED'; END IF;
 SELECT count(*)::integer INTO attempts FROM public.pparcial_respuestas_sesion a WHERE a.sesion_id=s.id AND a.pregunta_num=p_pregunta_num;
 IF p_intentos>0 AND (attempts>=7 OR p_intentos<>attempts+1) THEN RAISE EXCEPTION 'ATTEMPT_LIMIT'; END IF;
 IF p_intentos=0 AND p_correcta THEN RAISE EXCEPTION 'ANSWER_INVALID'; END IF;
 INSERT INTO public.pparcial_respuestas_sesion(sesion_id,evento_id,pregunta_num,correcta,puntos,intentos,codigo)
 VALUES(s.id,p_event_id,p_pregunta_num,p_correcta,CASE WHEN p_correcta THEN 1 ELSE 0 END,p_intentos,coalesce(p_codigo,''));
 UPDATE public.pparcial_sesiones x SET snapshot=p_snapshot,revision=x.revision+1,actualizado_en=clock_timestamp() WHERE x.id=s.id RETURNING x.* INTO s;
 RETURN jsonb_build_object('ok',true,'revision',s.revision,'server_now',clock_timestamp(),'deadline_at',s.deadline_at);
END $$;

CREATE OR REPLACE FUNCTION public.pparcial_request_extension(p_documento text,p_periodo text,p_session_token uuid,p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.pparcial_sesiones%ROWTYPE;
BEGIN
 SELECT x.* INTO s FROM public.pparcial_sesiones x WHERE x.documento=p_documento AND x.periodo=p_periodo AND x.session_token=p_session_token FOR UPDATE;
 IF NOT FOUND OR p_event_id IS NULL THEN RAISE EXCEPTION 'SESSION_INVALID'; END IF;
 IF NOT p_event_id=ANY(s.extension_events) THEN
  IF s.estado='finalizado' OR s.extensiones_usadas>=3 THEN RAISE EXCEPTION 'EXTENSION_LIMIT'; END IF;
  IF clock_timestamp()<s.deadline_at THEN RAISE EXCEPTION 'TIME_NOT_EXPIRED'; END IF;
  UPDATE public.pparcial_sesiones x SET extensiones_usadas=x.extensiones_usadas+1,deadline_at=clock_timestamp()+interval '5 minutes',extension_events=array_append(x.extension_events,p_event_id),revision=x.revision+1,actualizado_en=clock_timestamp() WHERE x.id=s.id RETURNING x.* INTO s;
 END IF;
 RETURN jsonb_build_object('revision',s.revision,'extensiones_usadas',s.extensiones_usadas,'deadline_at',s.deadline_at,'server_now',clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.pparcial_finalize_session(p_documento text,p_periodo text,p_session_token uuid,p_revision bigint,p_nota_final real DEFAULT NULL,p_respuestas jsonb DEFAULT '[]',p_snapshot jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.pparcial_sesiones%ROWTYPE; correct_count integer; exits integer; grade real;
BEGIN
 SELECT x.* INTO s FROM public.pparcial_sesiones x WHERE x.documento=p_documento AND x.periodo=p_periodo AND x.session_token=p_session_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_INVALID'; END IF;
 IF s.estado='finalizado' THEN RETURN jsonb_build_object('estado',s.estado,'nota_final',s.nota_final,'revision',s.revision,'server_now',clock_timestamp(),'snapshot',s.snapshot); END IF;
 IF p_revision IS NULL OR p_revision<>s.revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 -- Grade comes from acknowledged responses, never the caller's proposed grade.
 SELECT count(*)::integer INTO correct_count FROM (SELECT DISTINCT ON(a.pregunta_num) a.correcta FROM public.pparcial_respuestas_sesion a WHERE a.sesion_id=s.id ORDER BY a.pregunta_num,a.id DESC) latest WHERE latest.correcta;
 exits=least(100,greatest(0,coalesce((s.snapshot->>'penalSalidas')::integer,0)));
 grade=greatest(0,round((correct_count*5.0/9 - s.extensiones_usadas*0.5 - exits*0.1)::numeric,1))::real;
 UPDATE public.pparcial_sesiones x SET estado='finalizado',nota_final=grade,revision=x.revision+1,finalizado_en=clock_timestamp(),actualizado_en=clock_timestamp() WHERE x.id=s.id RETURNING x.* INTO s;
 -- New documents remain visible in the existing teacher panel. Existing history is immutable.
 INSERT INTO public.pparcial_intentos(documento,nombre,estado,pregunta_actual,tiempo_restante,extensiones_usadas,penal_salidas,nota_final,creado_en,finalizado_en)
 SELECT s.documento,s.nombre,'finalizado',least(9,greatest(1,coalesce((s.snapshot->>'preguntaActual')::integer,1))),greatest(0,extract(epoch from (s.deadline_at-clock_timestamp()))::integer),s.extensiones_usadas,exits,grade,s.creado_en,s.finalizado_en
 WHERE NOT EXISTS (SELECT 1 FROM public.pparcial_intentos old_attempt WHERE old_attempt.documento=s.documento);
 RETURN jsonb_build_object('estado',s.estado,'nota_final',s.nota_final,'revision',s.revision,'server_now',clock_timestamp(),'snapshot',s.snapshot);
END $$;

REVOKE ALL ON FUNCTION public.pparcial_begin_session(text,text,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pparcial_save_snapshot(text,text,uuid,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pparcial_append_answer(text,text,uuid,uuid,integer,boolean,real,integer,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pparcial_request_extension(text,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pparcial_finalize_session(text,text,uuid,bigint,real,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pparcial_begin_session(text,text,uuid,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pparcial_save_snapshot(text,text,uuid,bigint,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pparcial_append_answer(text,text,uuid,uuid,integer,boolean,real,integer,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pparcial_request_extension(text,text,uuid,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pparcial_finalize_session(text,text,uuid,bigint,real,jsonb,jsonb) TO anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

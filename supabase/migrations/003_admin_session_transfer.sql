ALTER TABLE public.pparcial_sesiones ADD COLUMN IF NOT EXISTS docente_permite_reanudar boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.pparcial_begin_session(p_documento text, p_periodo text, p_session_token uuid, p_nombre text DEFAULT NULL::text, p_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
 ELSIF s.session_token<>p_session_token THEN
  IF s.docente_permite_reanudar THEN
   UPDATE public.pparcial_sesiones x SET session_token=p_session_token,
    docente_permite_reanudar=false, revision=x.revision+1, actualizado_en=clock_timestamp()
   WHERE x.id=s.id RETURNING x.* INTO s;
  ELSE RAISE EXCEPTION 'SESSION_IN_USE'; END IF;
 END IF;
 RETURN (to_jsonb(s)-'session_token'-'extension_events')||jsonb_build_object('server_now',clock_timestamp());
END $function$
;

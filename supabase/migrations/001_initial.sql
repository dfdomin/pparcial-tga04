-- PParcial 2026-2: Tablas para Fundamentos de Computación
-- Ejecutar en Supabase SQL Editor (reemplaza migración anterior)

-- Primero eliminar políticas viejas si existen
DROP POLICY IF EXISTS "Acceso público estudiantes" ON pparcial_estudiantes;
DROP POLICY IF EXISTS "Acceso público intentos" ON pparcial_intentos;
DROP POLICY IF EXISTS "Acceso público respuestas" ON pparcial_respuestas;
DROP POLICY IF EXISTS "Acceso público eventos" ON pparcial_eventos;

-- Estudiantes importados desde PDF Academusoft
CREATE TABLE IF NOT EXISTS pparcial_estudiantes (
  id SERIAL PRIMARY KEY,
  documento TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  grupo TEXT,
  horario TEXT,
  periodo TEXT DEFAULT '2026-2',
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Intentos del parcial
CREATE TABLE IF NOT EXISTS pparcial_intentos (
  id SERIAL PRIMARY KEY,
  documento TEXT UNIQUE NOT NULL,
  nombre TEXT,
  estado TEXT DEFAULT 'en_progreso',
  pregunta_actual INT DEFAULT 1,
  tiempo_restante INT DEFAULT 3000,
  extensiones_usadas INT DEFAULT 0,
  penal_salidas INT DEFAULT 0,
  nota_final REAL,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  finalizado_en TIMESTAMPTZ
);

-- Respuestas por pregunta
CREATE TABLE IF NOT EXISTS pparcial_respuestas (
  id SERIAL PRIMARY KEY,
  documento TEXT NOT NULL,
  pregunta_num INT,
  correcta BOOLEAN DEFAULT false,
  puntos REAL DEFAULT 0,
  intentos INT DEFAULT 1,
  codigo TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Eventos de integridad
CREATE TABLE IF NOT EXISTS pparcial_eventos (
  id SERIAL PRIMARY KEY,
  documento TEXT NOT NULL,
  tipo TEXT,
  ocurrido_en TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Permitir acceso público para la app
ALTER TABLE pparcial_estudiantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pparcial_intentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pparcial_respuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pparcial_eventos ENABLE ROW LEVEL SECURITY;

-- Políticas por operación (FOR ALL no es válido en PostgreSQL)
CREATE POLICY "select_estudiantes" ON pparcial_estudiantes FOR SELECT USING (true);
CREATE POLICY "insert_estudiantes" ON pparcial_estudiantes FOR INSERT WITH CHECK (true);
CREATE POLICY "update_estudiantes" ON pparcial_estudiantes FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "select_intentos" ON pparcial_intentos FOR SELECT USING (true);
CREATE POLICY "insert_intentos" ON pparcial_intentos FOR INSERT WITH CHECK (true);
CREATE POLICY "update_intentos" ON pparcial_intentos FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "select_respuestas" ON pparcial_respuestas FOR SELECT USING (true);
CREATE POLICY "insert_respuestas" ON pparcial_respuestas FOR INSERT WITH CHECK (true);
CREATE POLICY "update_respuestas" ON pparcial_respuestas FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "select_eventos" ON pparcial_eventos FOR SELECT USING (true);
CREATE POLICY "insert_eventos" ON pparcial_eventos FOR INSERT WITH CHECK (true);

-- Insertar estudiantes de prueba
INSERT INTO pparcial_estudiantes (documento, nombre, grupo, horario) VALUES
  ('12345', 'Dany Perez', '7_GA_G1', 'Vie 07:00-11:00'),
  ('67890', 'Maria Lopez', '7_GA_G2', 'Vie 13:00-17:00'),
  ('11111', 'Carlos Ruiz', '7_GA_G1', 'Vie 07:00-11:00')
ON CONFLICT (documento) DO NOTHING;

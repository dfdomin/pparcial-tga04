-- PParcial 2026-2: Tablas para Fundamentos de Computación
-- Ejecutar en Supabase SQL Editor

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
  documento TEXT REFERENCES pparcial_estudiantes(documento),
  nombre TEXT,
  estado TEXT DEFAULT 'en_progreso', -- en_progreso | finalizado
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
  documento TEXT REFERENCES pparcial_estudiantes(documento),
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
  documento TEXT REFERENCES pparcial_estudiantes(documento),
  tipo TEXT, -- salida_pantalla, copiar, pegar
  ocurrido_en TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Permitir acceso público para la app
ALTER TABLE pparcial_estudiantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pparcial_intentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pparcial_respuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pparcial_eventos ENABLE ROW LEVEL SECURITY;

-- Políticas públicas (la app usa la anon key)
CREATE POLICY "Acceso público estudiantes" ON pparcial_estudiantes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público intentos" ON pparcial_intentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público respuestas" ON pparcial_respuestas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público eventos" ON pparcial_eventos FOR ALL USING (true) WITH CHECK (true);

-- Insertar estudiantes de prueba
INSERT INTO pparcial_estudiantes (documento, nombre, grupo, horario) VALUES
  ('12345', 'Dany Perez', '7_GA_G1', 'Vie 07:00-11:00'),
  ('67890', 'Maria Lopez', '7_GA_G2', 'Vie 13:00-17:00'),
  ('11111', 'Carlos Ruiz', '7_GA_G1', 'Vie 07:00-11:00')
ON CONFLICT (documento) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- PLANTILLA: Importar estudiantes al parcial TGA04
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════
-- 
-- Instrucciones para otra IA o para generación automática:
-- Reemplazá los valores de ejemplo con los datos reales.
-- Cada estudiante es una fila en el INSERT.
-- Campos requeridos: documento, nombre
-- Campos opcionales: grupo, horario, periodo
--
-- Formato de cada fila:
-- ('documento', 'Nombre Completo', 'grupo', 'horario', 'periodo')
--
-- EJEMPLO:
-- ('12345', 'Dany Perez', '7_GA_G1', 'Vie 07:00-11:00', '2026-2')

-- Asegurar que la tabla existe
CREATE TABLE IF NOT EXISTS pparcial_estudiantes (
  id SERIAL PRIMARY KEY,
  documento TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  grupo TEXT,
  horario TEXT,
  periodo TEXT DEFAULT '2026-2',
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Activar RLS
ALTER TABLE pparcial_estudiantes ENABLE ROW LEVEL SECURITY;

-- Políticas (por si no existen)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'select_estudiantes' AND tablename = 'pparcial_estudiantes') THEN
    CREATE POLICY "select_estudiantes" ON pparcial_estudiantes FOR SELECT USING (true);
    CREATE POLICY "insert_estudiantes" ON pparcial_estudiantes FOR INSERT WITH CHECK (true);
    CREATE POLICY "update_estudiantes" ON pparcial_estudiantes FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- INSERTAR ESTUDIANTES (reemplazar con datos reales)
-- ═══════════════════════════════════════════════════════
INSERT INTO pparcial_estudiantes (documento, nombre, grupo, horario, periodo) VALUES
  ('12345', 'Dany Perez',           '7_GA_G1', 'Vie 07:00-11:00', '2026-2'),
  ('67890', 'Maria Lopez',          '7_GA_G2', 'Vie 13:00-17:00', '2026-2'),
  ('11111', 'Carlos Ruiz',          '7_GA_G1', 'Vie 07:00-11:00', '2026-2'),
  ('22222', 'Ana Martinez',         '7_GA_G2', 'Vie 13:00-17:00', '2026-2'),
  ('33333', 'Luis Hernandez',       '7_GA_G1', 'Vie 07:00-11:00', '2026-2'),
  ('44444', 'Sofia Ramirez',        '7_GA_G2', 'Vie 13:00-17:00', '2026-2'),
  ('55555', 'Pedro Gonzalez',       '7_GA_G1', 'Vie 07:00-11:00', '2026-2'),
  ('66666', 'Diana Torres',         '7_GA_G2', 'Vie 13:00-17:00', '2026-2'),
  ('77777', 'Jorge Silva',          '7_GA_G1', 'Vie 07:00-11:00', '2026-2'),
  ('88888', 'Camila Rojas',         '7_GA_G2', 'Vie 13:00-17:00', '2026-2'),
  ('99999', 'Andres Castro',        '7_GA_G1', 'Vie 07:00-11:00', '2026-2'),
  ('10101', 'Valentina Diaz',       '7_GA_G2', 'Vie 13:00-17:00', '2026-2'),
  ('20202', 'Felipe Vargas',        '7_GA_G1', 'Vie 07:00-11:00', '2026-2'),
  ('30303', 'Natalia Marin',        '7_GA_G2', 'Vie 13:00-17:00', '2026-2'),
  ('40404', 'Sebastian Ospina',     '7_GA_G1', 'Vie 07:00-11:00', '2026-2')
ON CONFLICT (documento) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  grupo = EXCLUDED.grupo,
  horario = EXCLUDED.horario,
  periodo = EXCLUDED.periodo;

-- Verificar importación
SELECT documento, nombre, grupo, horario, periodo FROM pparcial_estudiantes ORDER BY nombre;

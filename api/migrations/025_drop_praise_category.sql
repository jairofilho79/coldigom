-- 025: praises.category sai do schema (spec coldigui 2026-09-24-secoes-coletanea-subtags-design §1/§6).
-- As seções da Coletânea viraram subtags de «Coletânea»; a coluna foi esvaziada em
-- 2026-09-25 (run 2026-09-25T014917Z-secoes_coletanea_categoria, valores antigos em
-- scripts/validate-acervo/gabaritos/secoes_coletanea/execucao/). Aplicar SÓ depois do
-- deploy da API que não cita a coluna. O índice sai antes: SQLite não dropa coluna indexada.
DROP INDEX IF EXISTS idx_praises_category;
ALTER TABLE praises DROP COLUMN category;

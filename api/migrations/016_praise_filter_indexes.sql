-- Índices para os campos que o filtro e a tela de opções consultam.
--
-- GET /api/praises/filters roda três SELECT DISTINCT ... ORDER BY sobre estas
-- colunas a cada carregamento da tela inicial, e cada um era uma varredura
-- completa da tabela. As mesmas colunas aparecem nos filtros IN (...) da
-- listagem.
CREATE INDEX IF NOT EXISTS idx_praises_rhythm ON praises(rhythm);
CREATE INDEX IF NOT EXISTS idx_praises_tonality ON praises(tonality);
CREATE INDEX IF NOT EXISTS idx_praises_category ON praises(category);

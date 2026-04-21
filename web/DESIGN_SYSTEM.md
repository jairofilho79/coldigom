# Coldigom — Design System

> **Aesthetic Direction**: Archival Editorial — Warm, refined, distinctive.  
> Evokes the feeling of a curated hymnal or music archive: deep tones, elegant typography, and thoughtful spatial composition.

---

## 1. Philosophy

O design do Coldigom busca transmitir a sensação de uma coleção cuidadosamente preservada — como folhear um hinário antigo ou explorar um arquivo musical. A escuridão quente do fundo contrasta com acentos dourados que evocam papel envelhecido e folha de ouro. A tipografia mistura serifas elegantes para títulos com sans-serif limpa para leitura contínua.

**Princípios:**
- **Atmosfera sobre decoração**: fundos com profundidade, texturas sutis
- **Contraste térmico**: tons frios de índigo contra tons quentes de âmbar
- **Hierarquia tipográfica clara**: display serif + body sans-serif + mono para dados
- **Microinterações refinadas**: transições suaves que recompensam a interação

---

## 2. Paleta de Cores

### Primária — Índigo Profundo
Autoridade, arquivo, sagrado.

| Token | Hex | Uso |
|-------|-----|-----|
| `--c-primary-50` | `#f4f3ff` | Highlights sutis |
| `--c-primary-400` | `#978afb` | Elementos decorativos |
| `--c-primary-600` | `#5d3aed` | Links secundários |
| `--c-primary-950` | `#221065` | Sombras profundas |

### Acento — Âmbar/Dourado
Hinários, papel envelhecido, tradição.

| Token | Hex | Uso |
|-------|-----|-----|
| `--c-accent-300` | `#dec08e` | Texto em destaque |
| `--c-accent-400` | `#d0a265` | Ícones, bordas |
| `--c-accent-500` | `#c9a96e` | **Principal de ação** — botões, chips ativos, foco |
| `--c-accent-600` | `#b08a4a` | Hover em elementos de ação |
| `--c-accent-950` | `#3a2718` | Texto sobre fundo âmbar |

### Neutros — Warm Slate
Papel de arquivo, madeira, pedra.

| Token | Hex | Uso |
|-------|-----|-----|
| `--c-neutral-0` | `#ffffff` | Texto invertido |
| `--c-neutral-400` | `#a8a29e` | Descrições secundárias |
| `--c-neutral-600` | `#57534e` | Scrollbar hover |
| `--c-neutral-800` | `#292524` | Elementos de superfície |
| `--c-neutral-900` | `#1c1917` | Texto invertido profundo |

### Superfícies — Modo Escuro Quente

| Token | Hex | Uso |
|-------|-----|-----|
| `--bg-base` | `#0f0e13` | Fundo da página |
| `--bg-elevated` | `#17161f` | Cards, seções |
| `--bg-surface` | `#1e1d28` | Elementos internos |
| `--bg-surface-hover` | `#252431` | Hover em linhas/tables |
| `--bg-inset` | `#0a090e` | Scrollbar track |

### Texto

| Token | Hex | Uso |
|-------|-----|-----|
| `--text-primary` | `#f5f0e8` | Títulos, texto principal |
| `--text-secondary` | `#a89f91` | Corpo de texto |
| `--text-tertiary` | `#6b6459` | Labels, placeholders |
| `--text-inverse` | `#1c1917` | Texto sobre fundos claros |

### Bordas

| Token | Valor | Uso |
|-------|-------|-----|
| `--border-subtle` | `rgba(245,240,232,0.06)` | Divisores padrão |
| `--border-default` | `rgba(245,240,232,0.10)` | Inputs, cards |
| `--border-strong` | `rgba(245,240,232,0.16)` | Checkboxes, foco |
| `--border-accent` | `rgba(201,169,110,0.30)` | Hover em links |

### Semânticas

| Estado | Cor | Fundo |
|--------|-----|-------|
| Sucesso | `#2d7d46` | `#ecfdf3` |
| Aviso | `#b45309` | `#fffbeb` |
| Erro | `#b91c1c` | `#fef2f2` |
| Info | `#1d4ed8` | `#eff6ff` |

---

## 3. Tipografia

### Famílias

| Função | Fonte | Fallbacks |
|--------|-------|-----------|
| Display | Crimson Pro | Georgia, Times New Roman, serif |
| Body | Source Sans 3 | -apple-system, BlinkMacSystemFont, sans-serif |
| Mono | Source Code Pro | SF Mono, Monaco, monospace |

### Escala

| Token | Tamanho | Uso |
|-------|---------|-----|
| `--text-xs` | 12px | Labels, badges, tags |
| `--text-sm` | 14px | Corpo em tabelas, metadados |
| `--text-base` | 16px | Corpo padrão |
| `--text-lg` | 18px | Subtítulos |
| `--text-xl` | 20px | Títulos de seção |
| `--text-2xl` | 24px | Títulos de página (mobile) |
| `--text-3xl` | 30px | Títulos de página |
| `--text-4xl` | 36px | Títulos de destaque |
| `--text-5xl` | 48px | Marca principal |

### Pesos

| Token | Valor | Uso |
|-------|-------|-----|
| `--weight-light` | 300 | Subtítulos, descrições |
| `--weight-regular` | 400 | Corpo |
| `--weight-medium` | 500 | Links, botões |
| `--weight-semibold` | 600 | Títulos, labels |
| `--weight-bold` | 700 | Display, ênfase |

### Line Heights

| Token | Valor | Uso |
|-------|-------|-----|
| `--leading-none` | 1 | Títulos grandes |
| `--leading-tight` | 1.2 | Headings |
| `--leading-snug` | 1.35 | Subtítulos |
| `--leading-normal` | 1.5 | Corpo |
| `--leading-relaxed` | 1.65 | Letras, parágrafos longos |

---

## 4. Espaçamento

Base: **4px** (`0.25rem`)

| Token | Valor | Uso |
|-------|-------|-----|
| `--space-1` | 4px | Gap mínimo |
| `--space-2` | 8px | Gap interno pequeno |
| `--space-3` | 12px | Padding compacto |
| `--space-4` | 16px | Padrão |
| `--space-6` | 24px | Seções internas |
| `--space-8` | 32px | Seções |
| `--space-10` | 40px | Header spacing |
| `--space-12` | 48px | Grandes blocos |
| `--space-16` | 64px | Seções principais |
| `--space-24` | 96px | Estados vazios |

---

## 5. Elevação & Sombras

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Bordas sutis |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.4)` | Cards, dropdowns |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.5)` | Modais, menus |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.5)` | Overlays |
| `--shadow-glow` | `0 0 20px rgba(201,169,110,0.08)` | Chips ativos |
| `--shadow-glow-strong` | `0 0 30px rgba(201,169,110,0.15)` | Hover em chips |

### Raios

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 4px | Badges, tags |
| `--radius-md` | 8px | Botões, inputs |
| `--radius-lg` | 12px | Cards, seções |
| `--radius-xl` | 16px | Search bar, containers |
| `--radius-2xl` | 20px | Modais |
| `--radius-full` | 9999px | Chips, avatares |

---

## 6. Animações

### Timing Functions

| Token | Valor | Uso |
|-------|-------|-----|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Transições padrão |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Animações longas |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Chips, botões |

### Durações

| Token | Valor | Uso |
|-------|-------|-----|
| `--duration-fast` | 150ms | Hover, foco |
| `--duration-normal` | 250ms | Transições padrão |
| `--duration-slow` | 400ms | Entradas de página |
| `--duration-slower` | 600ms | Animações complexas |

### Keyframes Disponíveis

- `fadeIn` — opacidade 0 → 1
- `fadeInUp` — opacidade 0 + translateY(12px) → 1 + 0
- `fadeInScale` — opacidade 0 + scale(0.97) → 1 + 1
- `slideDown` — dropdown menu open
- `spin` — spinner de loading

---

## 7. Componentes

### Tag Chip

```
Estado default:
  bg: --bg-surface
  border: 1px solid --border-subtle
  color: --text-secondary
  radius: --radius-full
  padding: --space-2 --space-3
  font: --text-sm --weight-medium

Hover:
  border-color: --border-default
  color: --text-primary
  bg: --bg-surface-hover
  transform: translateY(-1px)

Ativo:
  bg: gradient(135deg, --c-accent-400, --c-accent-500)
  color: --c-accent-950
  border: transparent
  shadow: --shadow-glow
```

### Search Input

```
Default:
  bg: --bg-elevated
  border: 1px solid --border-default
  radius: --radius-xl
  padding: --space-4 --space-4 --space-4 --space-12
  shadow: inset 0 1px 2px rgba(0,0,0,0.2)

Focus:
  border-color: --c-accent-500
  shadow: 0 0 0 3px rgba(201,169,110,0.1), inset...
```

### Results Table

```
Container:
  bg: --bg-elevated
  border: 1px solid --border-subtle
  radius: --radius-xl
  shadow: --shadow-md

Header:
  bg: --bg-surface
  font: --text-xs --weight-semibold uppercase
  color: --text-tertiary
  letter-spacing: 0.1em
  border-bottom: 1px solid --border-subtle

Row:
  transition: background --duration-fast

Row hover:
  bg: --bg-surface-hover

Cell:
  padding: --space-4 --space-5
```

### Pagination Button

```
Default:
  bg: --bg-surface
  border: 1px solid --border-subtle
  color: --text-secondary
  radius: --radius-md

Hover:
  bg: --bg-surface-hover
  border-color: --border-default
  color: --text-primary

Ativo:
  bg: gradient(135deg, --c-accent-400, --c-accent-500)
  color: --c-accent-950
  shadow: --shadow-glow
```

### Detail Header

```
  bg: --bg-elevated
  border: 1px solid --border-subtle
  radius: --radius-xl
  padding: --space-8 --space-10
  shadow: --shadow-md

Accent line (top):
  height: 3px
  gradient: --c-accent-500 → --c-primary-600 → --c-accent-500
  opacity: 0.6
```

---

## 8. Layout

### Container

```
max-width: 1280px
margin: 0 auto
padding: 32px 24px (desktop)
padding: 24px 16px (mobile)
```

### Breakpoints

| Nome | Largura | Ajustes principais |
|------|---------|-------------------|
| Mobile | < 480px | Títulos menores, coluna única |
| Tablet | < 768px | Tabela scroll horizontal, grids 1 col |
| Desktop | ≥ 768px | Layout completo |

---

## 9. Assets

### Ícones
Usar SVG inline para consistência. Ícones padrão:
- Busca: círculo com lupa
- Limpar: X
- Seta: ▼ para dropdowns
- Ordenação: ↑ ↓
- Paginação: ← →

### Emojis como ícones contextuais
- 📖 — estado vazio / livro
- 📝 — letra
- 🎵 — áudio
- 📄 — PDF
- 🎸 — acordes
- ⚠ — erro

---

## 10. Checklist de Implementação

Ao criar novos componentes, verificar:
- [ ] Cores usando tokens CSS, nunca hardcoded
- [ ] Tipografia com `--font-display`, `--font-body`, `--font-mono`
- [ ] Espaçamento com tokens `--space-*`
- [ ] Transições com `--duration-*` e `--ease-*`
- [ ] Raios com `--radius-*`
- [ ] Sombras com `--shadow-*`
- [ ] Estados de foco visíveis (`:focus-visible`)
- [ ] Estados de hover e active
- [ ] Contraste adequado para acessibilidade
- [ ] Teste em mobile (max-width: 768px)

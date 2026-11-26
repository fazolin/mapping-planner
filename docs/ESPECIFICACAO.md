# Mapping Planner — Especificação v1

Status: rascunho para revisão · 25/11/2026

## 1. Objetivo

Ferramenta pessoal para planejar projetos de projection mapping: importar o modelo 3D do local, posicionar projetores e calcular cobertura, tamanho de imagem, resolução e brilho antes da montagem.

Referências de uso hoje: Mapping Matter (disguise) e projetos no Blender. O código, o nome e o visual são próprios; nada é copiado dessas ferramentas.

## 2. Escopo da v1

1. **Importação de modelo:** somente `.obj` (com `.mtl` opcional).
   - Escolha de unidade (m, cm, mm), eixo vertical (Y ou Z) e origem.
   - Exibição das dimensões do modelo para conferência.
2. **Cena:** navegação 3D, medição entre dois pontos, marcação de quais objetos/grupos do OBJ são superfícies de projeção.
3. **Projetores:** vários por cena; posição, rotação, alvo e modo retrato; edição com o mouse ou por valores exatos.
4. **Lentes:** throw ratio fixo ou zoom (mín./máx.) e lens shift H/V, limitados à faixa de cada modelo.
5. **Cálculos por projetor:**
   - distância de projeção ↔ largura/altura da imagem;
   - tamanho do pixel sobre a superfície;
   - lux estimado na superfície;
   - ângulo de incidência.
6. **Visualização:** cone/frustum, área de cobertura, sombras (oclusão pela geometria) e padrão de teste projetado.
7. **Biblioteca de equipamentos:** Panasonic, Epson, Optoma e Barco. Começa com poucos modelos e lentes conferidos; cadastro manual e importação por CSV.
8. **Projeto:** salvar e abrir em arquivo (`.json`), incluindo projetores e configurações da cena. O OBJ é referenciado ou embutido (a definir na etapa 5).

## 3. Fora da v1 (próximas fases)

- Formatos GLB/glTF e FBX
- Blend/sobreposição entre projetores
- Mapas de calor (brilho, pixel, ângulo)
- Relatórios em PDF e fichas de montagem
- Busca de equipamento por requisito, comparador de versões
- Sugestão automática de posições; calibração por pontos reais
- Lentes fisheye, UST com distorção, domos com blend
- Exportação para Blender, Resolume e TouchDesigner
- Customização da interface (ideias A–F, seção 8)

A arquitetura deve permitir essas adições sem reescrever o núcleo.

## 4. Métodos de cálculo

### 4.1 Modelo óptico
- Modelo **pinhole** (projeção em perspectiva sem distorção).
- `throw ratio = distância / largura da imagem`, com a distância medida da lente até a superfície, perpendicular a ela.
- Aspecto definido pela resolução nativa do projetor.

### 4.2 Lens shift (convenção a confirmar)
- Armazenado internamente como **fração da altura (V) e da largura (H) da imagem** em relação ao eixo da lente: `0` = imagem centrada no eixo.
- Cada fabricante publica em formato próprio (porcentagem da imagem, da meia-imagem, ou offset). A biblioteca guarda o valor original, a convenção da fonte e o valor convertido.

### 4.3 Cobertura e sombras
- Visualização na GPU (projective texture mapping + shadow map a partir de cada projetor).
- Números (área coberta, pixel, ângulo) por **raycasting** contra a geometria.

### 4.4 Brilho
- `lux ≈ lumens / área da imagem (m²)` no plano perpendicular, corrigido pelo cosseno do ângulo de incidência na superfície real.
- É uma estimativa: não considera perdas por lente, modo de imagem, envelhecimento da lâmpada, refletância da superfície nem luz ambiente.

### 4.5 Validação
- Testes automáticos com casos calculados à mão.
- Conferência contra as calculadoras dos fabricantes para os modelos da biblioteca.
- Quando possível, medição com projetor real.

## 5. Biblioteca de equipamentos

Campos por projetor:
- marca, modelo, resolução nativa, lumens (ISO/ANSI), tecnologia;
- dimensões, peso, posição da lente no corpo;
- lentes compatíveis (ou lente fixa).

Campos por lente:
- código, throw ratio mín./máx., faixa de lens shift H/V (valor original + convertido), observações (ex.: UST, fisheye).

Cada registro guarda **link da fonte** e **data de conferência**.

Fontes: fichas técnicas e manuais oficiais dos fabricantes. O ProjectorCentral não tem API pública conhecida; só entra como fonte com autorização deles.

## 6. Base técnica

- App web em **TypeScript** com **Three.js**.
- Núcleo de cálculo em módulo separado da interface, com testes.
- Roda localmente no navegador; preparado para hospedar na nuvem e, se necessário, empacotar como app para Mac e Windows.
- v1 sem login nem banco de dados.
- Versionamento com Git, repositório privado no GitHub.

## 7. Etapas

| Etapa | Entrega | Pronto quando |
|---|---|---|
| 1. Óptica | módulo de cálculo e convenções | os testes batem com os casos de referência |
| 2. Cena | importação OBJ, escala, navegação, medição | um modelo seu abre com as medidas certas |
| 3. Projetores | posicionamento, cobertura e sombras | dá para montar um estudo com 2+ projetores |
| 4. Biblioteca | modelos e lentes das 4 marcas | escolher um modelo aplica os limites corretos |
| 5. Projeto | salvar e abrir | a cena reabre igual |

## 8. Customização (para depois)

- A. Interface do seu jeito (painéis, atalhos, termos em português)
- B. Comparador de versões do projeto
- C. Busca de equipamento por requisito
- D. Inventário próprio (equipamentos, preço, disponibilidade)
- E. Integração com Blender, Resolume e TouchDesigner
- F. Outras ideias

## 9. Questões em aberto

- Entregáveis (PDF, fichas, arquivos para outros programas)
- Convenção final de lens shift
- OBJ referenciado ou embutido no arquivo de projeto
- Lista inicial de modelos de cada marca

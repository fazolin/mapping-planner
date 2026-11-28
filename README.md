# Mapping Planner

Ferramenta pessoal para planejar projetos de projection mapping.

**Online:** https://fazolin.github.io/mapping-planner/

Especificação: [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md)

## Andamento

| Etapa | Status |
|---|---|
| 1. Óptica (cálculos + testes) | ✅ |
| Calculadora de projeção | ✅ |
| 2. Cena 3D (OBJ, unidade/eixo/origem, navegação, medição, superfícies) | ✅ |
| 3. Projetores na cena (posição, apontar, lente, projeção com sombra, números) | ✅ |
| 4. Biblioteca de equipamentos | — |
| 5. Salvar/abrir projeto | — |

## Rodar no computador

```bash
npm install
npm run dev     # abre em http://localhost:5173
npm test        # testes dos cálculos
```

Cada envio para `main` roda os testes e publica no GitHub Pages.

Modelos 3D de clientes não devem ir para este repositório (ele é público).

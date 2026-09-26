# DkLanches - Sistema de Caixa Local

Sistema simples de cadastro de vendas de lanches com banco SQLite local.

## Produtos iniciais

- Xis
- Cachorro Quente
- Hamburguer
- Batata Frita
- Refrigerante
- Cerveja

## Como executar

```bash
cd /home/dklanches/projetos/dklanches-caixa
python3 server.py
```

Depois abra no navegador:

```text
http://localhost:8000
```

## Estrutura

- `server.py` - backend e banco SQLite
- `index.html` - tela do caixa
- `static/styles.css` - estilo visual
- `static/script.js` - interação do frontend
- `data/dklanches.db` - banco gerado automaticamente

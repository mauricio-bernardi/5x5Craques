# 5x5 Craques

Roleta de campeões de LoL para 2 times, com sorteio/balanceamento de jogadores e ranking compartilhado.

## Estrutura

```
5x5Craques/
├── backend/
│   └── schema.sql        # banco no Supabase: tabelas, permissões e funções
└── frontend/
    ├── index.html        # estrutura da página
    ├── css/style.css     # visual
    └── js/               # carregados em ordem pelo index.html
        ├── config.js     # URL/chave do Supabase e parâmetros do rating (único a editar)
        ├── utils.js      # $, norm, searchKey, shuffle
        ├── champions.js  # lista de campeões, retratos, Data Dragon
        ├── storage.js    # save/load no localStorage
        ├── pool.js       # campeões bloqueados (arrastar e soltar)
        ├── api.js        # chamadas ao Supabase
        ├── rating.js     # Elo e balanceamento dos times
        ├── players.js    # sorteio de jogadores e registro de resultado
        ├── ranking.js    # tabela de ranking e histórico
        ├── draft.js      # sorteio de campeões por rota
        └── main.js       # inicialização (sempre o último)
```

Os scripts são arquivos JS comuns (não ES modules) para a página funcionar abrindo o
`index.html` direto do disco. Eles compartilham variáveis globais, então **a ordem das
tags `<script>` no `index.html` importa**: `config.js` e `utils.js` primeiro, `main.js` por último.

## Configuração

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em `backend/schema.sql`, troque `TROQUE_ESTA_SENHA` pela senha do grupo.
3. No Supabase: **SQL Editor → New query**, cole o `schema.sql` e rode.
4. Em **Project Settings → API**, copie a Project URL e a chave anon/publishable para
   `frontend/js/config.js`.
5. Abra `frontend/index.html`. Para os outros acessarem, mande a pasta `frontend` ou hospede
   (Netlify Drop, GitHub Pages).

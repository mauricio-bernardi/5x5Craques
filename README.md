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
        ├── roster.js     # cadastro de jogadores e apelidos (nicks)
        ├── admin.js      # modo admin: senha, partida manual
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
2. No Supabase: **SQL Editor → New query**, cole o `schema.sql`, troque `TROQUE_ESTA_SENHA`
   pela senha do grupo **no editor** (não no arquivo, que é público) e rode.
3. Quando o `schema.sql` mudar, cole e rode de novo: nada é apagado e a senha existente é mantida.
4. Em **Project Settings → API**, copie a Project URL e a chave anon/publishable para
   `frontend/js/config.js`.
5. Abra `frontend/index.html`. Para os outros acessarem, hospede a pasta `frontend`.

## Publicação

O site é publicado no GitHub Pages por `.github/workflows/pages.yml`, que envia só a pasta
`frontend/` como raiz do site (o link não tem `/frontend/`). Cada `git push` na `main` atualiza o
site em ~1 minuto. Em **Settings → Pages**, o *Source* precisa estar em **GitHub Actions**.

## Modo admin

O botão **🔓 Modo admin** (no card do Ranking) pede a senha do grupo e libera:

- **⚔️ Registrar partida**: escolher os 10 jogadores, o vencedor e a data/hora (para lançar jogos antigos);
  o botão **⤵ Usar times do sorteio** preenche com os times sorteados.
- **👥 Jogadores**: cadastro e edição (veja abaixo).
- **Excluir** partidas no histórico (fora do modo admin o botão nem aparece).

A senha fica só na memória da página: fechar, recarregar ou abrir outra aba pede de novo.
Registrar o resultado pelos botões do sorteio também pede a senha se o modo admin não estiver ativo.

## Jogadores e apelidos

- **Cadastrar**: cole o link do perfil no op.gg (ex.: `https://op.gg/lol/summoners/br/Nick-BR1`);
  o nick é extraído do link. Também dá para digitar só o nick.
- **Sorteio**: os nicks cadastrados aparecem como sugestão nos campos, e o que for digitado com
  maiúsculas, acentos ou espaços diferentes é corrigido para o nick certo.
- **Apelidos**: outros nomes pelos quais a pessoa é chamada; também são reconhecidos no sorteio.
- **✏️ Editar**: troca o link do op.gg ou o nick; o nick antigo vira apelido automaticamente.
- **🔀 Juntar**: a mesma pessoa foi cadastrada duas vezes; as partidas passam para um só e o outro nome vira apelido.
- **🗑️ Excluir**: só para quem ainda não jogou.

No ranking, o nome de quem tem op.gg cadastrado vira link para o perfil.

Ao registrar uma partida, o site avisa quais nomes são desconhecidos e vão virar jogadores novos.

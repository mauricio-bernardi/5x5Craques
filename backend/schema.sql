-- =====================================================================
-- Roleta LoL - banco de jogadores, apelidos, partidas e ranking (Supabase)
-- Cole tudo no Supabase -> SQL Editor -> New query -> Run.
--
-- Pode ser rodado de novo a qualquer momento para atualizar o banco:
-- nada é apagado e a senha do grupo só é criada se ainda não existir.
-- Na PRIMEIRA vez, troque a senha na última seção (só no editor do
-- Supabase, nunca neste arquivo: o repositório é público).
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists players (
    id         bigint generated always as identity primary key,
    name       text not null check (length(trim(name)) between 1 and 30),
    name_key   text generated always as (lower(trim(name))) stored unique,
    created_at timestamptz not null default now()
);

-- Link do perfil no op.gg (o site sempre grava no formato https://op.gg/...).
alter table players add column if not exists opgg_url text;
alter table players drop constraint if exists players_opgg_url_check;
alter table players add constraint players_opgg_url_check
    check (opgg_url is null or (opgg_url ~ '^https://op\.gg/' and length(opgg_url) <= 200));

-- Outros nicks do mesmo jogador (erros de digitação, nicks antigos).
-- Um nome nunca pode ser ao mesmo tempo nome oficial e apelido: as funções garantem isso.
create table if not exists player_aliases (
    id        bigint generated always as identity primary key,
    player_id bigint not null references players (id) on delete cascade,
    alias     text not null check (length(trim(alias)) between 1 and 30),
    alias_key text generated always as (lower(trim(alias))) stored unique
);

create index if not exists player_aliases_player_idx on player_aliases (player_id);

create table if not exists matches (
    id        bigint generated always as identity primary key,
    played_at timestamptz not null default now(),
    winner    int not null check (winner in (1, 2))   -- 1 = Time Azul, 2 = Time Vermelho
);

create table if not exists match_players (
    match_id  bigint not null references matches (id) on delete cascade,
    player_id bigint not null references players (id) on delete cascade,
    team      int not null check (team in (1, 2)),
    primary key (match_id, player_id)
);

create index if not exists match_players_player_idx on match_players (player_id);

-- Senha do grupo: só quem sabe a senha consegue alterar dados.
-- Ninguém consegue ler esta tabela pela API.
create table if not exists app_secret (
    secret text primary key
);

-- ---------- Visão com uma linha por partida ----------
-- Usa sempre o nome oficial atual: renomear ou juntar jogadores atualiza o histórico.
create or replace view match_history with (security_invoker = true) as
select m.id,
       m.played_at,
       m.winner,
       array_agg(p.name order by p.name) filter (where mp.team = 1) as team1,
       array_agg(p.name order by p.name) filter (where mp.team = 2) as team2
from matches m
join match_players mp on mp.match_id = m.id
join players p on p.id = mp.player_id
group by m.id;

-- ---------- Permissões (leitura liberada, escrita só pelas funções) ----------
alter table players        enable row level security;
alter table player_aliases enable row level security;
alter table matches        enable row level security;
alter table match_players  enable row level security;
alter table app_secret     enable row level security;

drop policy if exists "leitura publica" on players;
drop policy if exists "leitura publica" on player_aliases;
drop policy if exists "leitura publica" on matches;
drop policy if exists "leitura publica" on match_players;

create policy "leitura publica" on players        for select to anon, authenticated using (true);
create policy "leitura publica" on player_aliases for select to anon, authenticated using (true);
create policy "leitura publica" on matches        for select to anon, authenticated using (true);
create policy "leitura publica" on match_players  for select to anon, authenticated using (true);

revoke all on players, player_aliases, matches, match_players, app_secret, match_history from anon, authenticated;
grant select on players, player_aliases, matches, match_players, match_history to anon, authenticated;

-- ---------- Funções internas (não acessíveis pela API) ----------
create or replace function check_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_secret is null or not exists (select 1 from app_secret where secret = p_secret) then
        raise exception 'senha inválida';
    end if;
end;
$$;

-- Acha o jogador pelo nome oficial ou por qualquer apelido (ignora maiúsculas e espaços nas pontas).
create or replace function find_player(p_name text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select id from players where name_key = lower(trim(p_name))),
        (select player_id from player_aliases where alias_key = lower(trim(p_name)))
    );
$$;

revoke execute on function check_secret(text) from public, anon, authenticated;
revoke execute on function find_player(text) from public, anon, authenticated;

-- ---------- Funções da API (todas pedem a senha do grupo) ----------
-- Versão antiga, sem data (substituída pela de baixo, que aceita a data da partida).
drop function if exists register_match(text, text[], text[], int);

-- Registra uma partida. Cada nome é procurado pelo nome oficial e pelos apelidos;
-- quem não for encontrado vira um jogador novo. Sem data, usa o momento atual.
create or replace function register_match(
    p_secret    text,
    p_team1     text[],
    p_team2     text[],
    p_winner    int,
    p_played_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_match  bigint;
    v_player bigint;
    v_name   text;
    v_team   int;
begin
    perform check_secret(p_secret);

    if coalesce(array_length(p_team1, 1), 0) <> 5 or coalesce(array_length(p_team2, 1), 0) <> 5 then
        raise exception 'cada time precisa ter 5 jogadores';
    end if;

    if p_winner not in (1, 2) then
        raise exception 'vencedor inválido';
    end if;

    if p_played_at > now() + interval '1 hour' then
        raise exception 'a data da partida está no futuro';
    end if;

    insert into matches (winner, played_at) values (p_winner, coalesce(p_played_at, now()))
    returning id into v_match;

    for v_team in 1..2 loop
        foreach v_name in array (case when v_team = 1 then p_team1 else p_team2 end) loop
            v_player := find_player(v_name);

            if v_player is null then
                insert into players (name) values (trim(v_name)) returning id into v_player;
            end if;

            if exists (select 1 from match_players where match_id = v_match and player_id = v_player) then
                raise exception 'o jogador "%" aparece duas vezes na partida', trim(v_name);
            end if;

            insert into match_players (match_id, player_id, team) values (v_match, v_player, v_team);
        end loop;
    end loop;

    return v_match;
end;
$$;

-- Exclui uma partida registrada por engano.
create or replace function delete_match(p_secret text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);

    delete from matches where id = p_id;

    if not found then
        raise exception 'partida não encontrada';
    end if;
end;
$$;

-- Versões antigas destas funções (substituídas por add_player com op.gg e update_player).
drop function if exists add_player(text, text);
drop function if exists rename_player(text, bigint, text);

-- Usado pelo botão "Desbloquear": só confere a senha.
create or replace function verify_secret(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);
    return true;
end;
$$;

-- Cadastra um jogador (normalmente a partir do link do op.gg).
create or replace function add_player(p_secret text, p_name text, p_opgg_url text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id bigint;
begin
    perform check_secret(p_secret);

    if find_player(p_name) is not null then
        raise exception 'o nome "%" já está em uso', trim(p_name);
    end if;

    insert into players (name, opgg_url) values (trim(p_name), nullif(trim(p_opgg_url), ''))
    returning id into v_id;

    return v_id;
end;
$$;

create or replace function add_alias(p_secret text, p_player_id bigint, p_alias text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);

    if not exists (select 1 from players where id = p_player_id) then
        raise exception 'jogador não encontrado';
    end if;

    if find_player(p_alias) is not null then
        raise exception 'o nome "%" já está em uso', trim(p_alias);
    end if;

    insert into player_aliases (player_id, alias) values (p_player_id, trim(p_alias));
end;
$$;

create or replace function remove_alias(p_secret text, p_alias_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);

    delete from player_aliases where id = p_alias_id;

    if not found then
        raise exception 'apelido não encontrado';
    end if;
end;
$$;

-- Troca o nome oficial e o link do op.gg. Se o nome mudar, o antigo vira apelido,
-- então continua sendo reconhecido.
create or replace function update_player(p_secret text, p_player_id bigint, p_new_name text, p_opgg_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_old   text;
    v_other bigint;
begin
    perform check_secret(p_secret);

    select name into v_old from players where id = p_player_id;

    if not found then
        raise exception 'jogador não encontrado';
    end if;

    v_other := find_player(p_new_name);

    if v_other is not null and v_other <> p_player_id then
        raise exception 'o nome "%" já está em uso', trim(p_new_name);
    end if;

    -- Se o novo nome era apelido deste jogador, ele deixa de ser apelido.
    delete from player_aliases where alias_key = lower(trim(p_new_name));

    update players
    set name = trim(p_new_name), opgg_url = nullif(trim(p_opgg_url), '')
    where id = p_player_id;

    -- Só maiúsculas/minúsculas mudaram: não precisa guardar o antigo.
    if lower(trim(v_old)) <> lower(trim(p_new_name)) then
        insert into player_aliases (player_id, alias) values (p_player_id, v_old);
    end if;
end;
$$;

-- Junta dois cadastros da mesma pessoa: as partidas e apelidos de p_from passam para p_into,
-- e o nome de p_from vira apelido de p_into.
create or replace function merge_players(p_secret text, p_from bigint, p_into bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_from_name text;
begin
    perform check_secret(p_secret);

    if p_from = p_into then
        raise exception 'escolha dois jogadores diferentes';
    end if;

    select name into v_from_name from players where id = p_from;

    if not found or not exists (select 1 from players where id = p_into) then
        raise exception 'jogador não encontrado';
    end if;

    if exists (
        select 1
        from match_players a
        join match_players b on b.match_id = a.match_id
        where a.player_id = p_from and b.player_id = p_into
    ) then
        raise exception 'os dois jogaram na mesma partida, então não podem ser a mesma pessoa';
    end if;

    update match_players  set player_id = p_into where player_id = p_from;
    update player_aliases set player_id = p_into where player_id = p_from;

    -- Arenas também passam para quem fica (se os dois estiverem na mesma Arena, vale a de quem fica).
    update arena_results set player_id = p_into
    where player_id = p_from
      and match_id not in (select match_id from arena_results where player_id = p_into);

    delete from players where id = p_from;

    insert into player_aliases (player_id, alias) values (p_into, v_from_name);
end;
$$;

-- Só apaga quem nunca jogou (para não mexer no ranking); para os outros, use merge_players.
create or replace function delete_player(p_secret text, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);

    if exists (select 1 from match_players where player_id = p_player_id)
       or exists (select 1 from arena_results ar join arena_games g on g.match_id = ar.match_id
                  where ar.player_id = p_player_id and g.played_at >= arena_season_start()) then
        raise exception 'este jogador já tem partidas; para tirá-lo da lista, junte-o com outro jogador';
    end if;

    delete from players where id = p_player_id;

    if not found then
        raise exception 'jogador não encontrado';
    end if;
end;
$$;

revoke execute on function register_match(text, text[], text[], int, timestamptz) from public;
revoke execute on function delete_match(text, bigint) from public;
revoke execute on function verify_secret(text) from public;
revoke execute on function add_player(text, text, text) from public;
revoke execute on function add_alias(text, bigint, text) from public;
revoke execute on function remove_alias(text, bigint) from public;
revoke execute on function update_player(text, bigint, text, text) from public;
revoke execute on function merge_players(text, bigint, bigint) from public;
revoke execute on function delete_player(text, bigint) from public;

grant execute on function register_match(text, text[], text[], int, timestamptz) to anon, authenticated;
grant execute on function delete_match(text, bigint) to anon, authenticated;
grant execute on function verify_secret(text) to anon, authenticated;
grant execute on function add_player(text, text, text) to anon, authenticated;
grant execute on function add_alias(text, bigint, text) to anon, authenticated;
grant execute on function remove_alias(text, bigint) to anon, authenticated;
grant execute on function update_player(text, bigint, text, text) to anon, authenticated;
grant execute on function merge_players(text, bigint, bigint) to anon, authenticated;
grant execute on function delete_player(text, bigint) to anon, authenticated;

-- =====================================================================
-- Areninha: ranking das partidas de Arena (importadas da API da Riot pelo
-- robô scripts/arena-sync.mjs, que roda no GitHub Actions).
-- =====================================================================

-- PUUID: código fixo da conta na Riot (não muda quando o jogador troca de nick).
-- puuid_source guarda o Riot ID de onde ele veio, para saber quando reconsultar.
alter table players add column if not exists puuid text;
alter table players add column if not exists puuid_source text;
create unique index if not exists players_puuid_key on players (puuid);
-- Quando o robô já importou as últimas 100 Arenas do jogador (histórico do Resenhômetro).
alter table players add column if not exists arena_backfill_at timestamptz;

create table if not exists arena_games (
    match_id   text primary key check (match_id ~ '^[A-Z0-9]+_[0-9]+$'),
    played_at  timestamptz not null,
    duration_s int not null default 0,
    counted    boolean not null default true,   -- false = admin tirou da conta (ou partida inválida)
    synced_at  timestamptz not null default now()
);

create table if not exists arena_results (
    match_id  text not null references arena_games (match_id) on delete cascade,
    player_id bigint not null references players (id) on delete cascade,
    placement int not null check (placement between 1 and 8),
    champion  text check (length(champion) <= 40),
    primary key (match_id, player_id)
);

create index if not exists arena_results_player_idx on arena_results (player_id);
create index if not exists arena_games_played_idx on arena_games (played_at);

-- Início da temporada: o ranking só conta Arenas a partir daqui. As mais antigas
-- (últimas 100 de cada jogador) ficam no banco só para o Resenhômetro.
-- Precisa bater com ARENA_START em .github/workflows/arena-sync.yml.
create or replace function arena_season_start()
returns timestamptz
language sql
immutable
as $$ select timestamptz '2026-11-01 00:00:00-03' $$;

-- Pontos por colocação. Mudar aqui recalcula todo o ranking.
create or replace function arena_points(p_placement int)
returns int
language sql
immutable
as $$
    select case p_placement
        when 1 then 30 when 2 then 20 when 3 then 10
        when 4 then -10 when 5 then -20 when 6 then -30
        else 0
    end;
$$;

-- Ranking: todos os cadastrados, começando com 0 (quem perde mais do que ganha fica negativo).
create or replace view arena_ranking with (security_invoker = true) as
with r as (
    select ar.player_id, ar.placement, g.played_at
    from arena_results ar
    join arena_games g on g.match_id = ar.match_id
    where g.counted and g.played_at >= arena_season_start()
)
select p.id as player_id,
       p.name,
       p.opgg_url,
       coalesce(sum(arena_points(r.placement)), 0)::int as points,
       count(r.placement)::int as games,
       (count(*) filter (where r.placement = 1))::int as firsts,
       round(avg(r.placement), 2) as avg_placement,
       (array_agg(r.placement order by r.played_at desc) filter (where r.placement is not null))[1] as last_placement,
       max(r.played_at) as last_played
from players p
left join r on r.player_id = p.id
group by p.id;

-- Partidas com os cadastrados que jogaram cada uma.
create or replace view arena_history with (security_invoker = true) as
select g.match_id,
       g.played_at,
       g.duration_s,
       g.counted,
       jsonb_agg(jsonb_build_object(
           'name', p.name,
           'placement', ar.placement,
           'champion', ar.champion,
           'points', arena_points(ar.placement)
       ) order by ar.placement, p.name) as players
from arena_games g
join arena_results ar on ar.match_id = g.match_id
join players p on p.id = ar.player_id
where g.played_at >= arena_season_start()
group by g.match_id;

-- Resenhômetro: cada time de cada Arena (com todo o histórico importado).
-- Na Arena os parceiros de time têm a mesma colocação, então time = partida + colocação.
create or replace view arena_teams with (security_invoker = true) as
select g.match_id,
       g.played_at,
       ar.placement,
       array_agg(ar.player_id order by ar.player_id) as players
from arena_games g
join arena_results ar on ar.match_id = g.match_id
where g.counted
group by g.match_id, g.played_at, ar.placement;

alter table arena_games   enable row level security;
alter table arena_results enable row level security;

drop policy if exists "leitura publica" on arena_games;
drop policy if exists "leitura publica" on arena_results;

create policy "leitura publica" on arena_games   for select to anon, authenticated using (true);
create policy "leitura publica" on arena_results for select to anon, authenticated using (true);

revoke all on arena_games, arena_results, arena_ranking, arena_history, arena_teams from anon, authenticated;
grant select on arena_games, arena_results, arena_ranking, arena_history, arena_teams to anon, authenticated;

-- Robô: guarda o PUUID de um jogador.
create or replace function arena_set_puuid(p_secret text, p_player_id bigint, p_puuid text, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);

    if p_puuid !~ '^[A-Za-z0-9_-]{40,100}$' then
        raise exception 'puuid inválido';
    end if;

    -- Conta diferente: o histórico precisa ser importado de novo.
    update players
       set arena_backfill_at = case when puuid is distinct from p_puuid then null else arena_backfill_at end,
           puuid = p_puuid,
           puuid_source = p_source
     where id = p_player_id;

    if not found then
        raise exception 'jogador não encontrado';
    end if;
end;
$$;

-- Robô: grava uma partida e as colocações dos cadastrados. Rodar de novo não duplica.
-- p_results: [{ "player_id": 1, "placement": 3, "champion": "Ahri" }, ...]
create or replace function arena_ingest(
    p_secret    text,
    p_match_id  text,
    p_played_at timestamptz,
    p_duration  int,
    p_counted   boolean,
    p_results   jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v jsonb;
begin
    perform check_secret(p_secret);

    insert into arena_games (match_id, played_at, duration_s, counted)
    values (p_match_id, p_played_at, coalesce(p_duration, 0), coalesce(p_counted, true))
    on conflict (match_id) do nothing;

    for v in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
        insert into arena_results (match_id, player_id, placement, champion)
        values (p_match_id, (v->>'player_id')::bigint, (v->>'placement')::int, left(v->>'champion', 40))
        on conflict (match_id, player_id) do nothing;
    end loop;
end;
$$;

-- Robô: marca que as últimas 100 Arenas do jogador já foram importadas.
create or replace function arena_backfill_done(p_secret text, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);
    update players set arena_backfill_at = now() where id = p_player_id;
end;
$$;

-- Admin: tira uma partida da conta (ou devolve).
create or replace function arena_set_counted(p_secret text, p_match_id text, p_counted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform check_secret(p_secret);

    update arena_games set counted = p_counted where match_id = p_match_id;

    if not found then
        raise exception 'partida não encontrada';
    end if;
end;
$$;

revoke execute on function arena_set_puuid(text, bigint, text, text) from public;
revoke execute on function arena_ingest(text, text, timestamptz, int, boolean, jsonb) from public;
revoke execute on function arena_set_counted(text, text, boolean) from public;
revoke execute on function arena_backfill_done(text, bigint) from public;

grant execute on function arena_set_puuid(text, bigint, text, text) to anon, authenticated;
grant execute on function arena_ingest(text, text, timestamptz, int, boolean, jsonb) to anon, authenticated;
grant execute on function arena_set_counted(text, text, boolean) to anon, authenticated;
grant execute on function arena_backfill_done(text, bigint) to anon, authenticated;

-- ---------- Senha do grupo (só na primeira vez) ----------
-- Troque TROQUE_ESTA_SENHA no editor do Supabase antes de rodar pela primeira vez.
-- Se já existe uma senha, esta linha não faz nada.
insert into app_secret (secret)
select 'TROQUE_ESTA_SENHA'
where not exists (select 1 from app_secret);

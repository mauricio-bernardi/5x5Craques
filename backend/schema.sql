-- =====================================================================
-- Roleta LoL - banco de jogadores, partidas e ranking (Supabase)
-- Cole tudo no Supabase -> SQL Editor -> New query -> Run.
-- ANTES de rodar, troque a senha na última seção.
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists players (
    id         bigint generated always as identity primary key,
    name       text not null check (length(trim(name)) between 1 and 30),
    name_key   text generated always as (lower(trim(name))) stored unique,
    created_at timestamptz not null default now()
);

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

-- Senha do grupo: só quem sabe a senha consegue registrar/excluir partidas.
-- Ninguém consegue ler esta tabela pela API.
create table if not exists app_secret (
    secret text primary key
);

-- ---------- Visão com uma linha por partida ----------
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
alter table players       enable row level security;
alter table matches       enable row level security;
alter table match_players enable row level security;
alter table app_secret    enable row level security;

drop policy if exists "leitura publica" on players;
drop policy if exists "leitura publica" on matches;
drop policy if exists "leitura publica" on match_players;

create policy "leitura publica" on players       for select to anon, authenticated using (true);
create policy "leitura publica" on matches       for select to anon, authenticated using (true);
create policy "leitura publica" on match_players for select to anon, authenticated using (true);

revoke all on players, matches, match_players, app_secret, match_history from anon, authenticated;
grant select on players, matches, match_players, match_history to anon, authenticated;

-- ---------- Funções ----------
-- Registra uma partida: cria os jogadores que ainda não existem (pelo nome,
-- ignorando maiúsculas/minúsculas) e grava tudo de uma vez.
create or replace function register_match(p_secret text, p_team1 text[], p_team2 text[], p_winner int)
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
    if not exists (select 1 from app_secret where secret = p_secret) then
        raise exception 'senha inválida';
    end if;

    if coalesce(array_length(p_team1, 1), 0) <> 5 or coalesce(array_length(p_team2, 1), 0) <> 5 then
        raise exception 'cada time precisa ter 5 jogadores';
    end if;

    if p_winner not in (1, 2) then
        raise exception 'vencedor inválido';
    end if;

    insert into matches (winner) values (p_winner) returning id into v_match;

    for v_team in 1..2 loop
        foreach v_name in array (case when v_team = 1 then p_team1 else p_team2 end) loop
            insert into players (name) values (trim(v_name))
            on conflict (name_key) do update set name = players.name
            returning id into v_player;

            -- Nome repetido na mesma partida viola a chave primária e cancela tudo.
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
    if not exists (select 1 from app_secret where secret = p_secret) then
        raise exception 'senha inválida';
    end if;

    delete from matches where id = p_id;

    if not found then
        raise exception 'partida não encontrada';
    end if;
end;
$$;

revoke execute on function register_match(text, text[], text[], int) from public;
revoke execute on function delete_match(text, bigint) from public;
grant execute on function register_match(text, text[], text[], int) to anon, authenticated;
grant execute on function delete_match(text, bigint) to anon, authenticated;

-- ---------- Senha do grupo (TROQUE antes de rodar) ----------
insert into app_secret (secret) values ('TROQUE_ESTA_SENHA')
on conflict do nothing;

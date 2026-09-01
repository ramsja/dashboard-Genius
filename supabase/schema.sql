create extension if not exists pgcrypto;

create table if not exists public.transaction_records (
    id bigint generated always as identity primary key,
    source_transaction_id text,
    created_at timestamptz,
    site text,
    parent_id text,
    user_id text,
    username text,
    user_type text,
    currency text,
    income numeric,
    status numeric,
    total numeric,
    commission numeric,
    balance numeric,
    current_balance numeric,
    wallet text,
    transaction_type text,
    causal_group text,
    causal text,
    causal_product text,
    description text,
    note text,
    ip_address inet,
    discipline text not null default 'otros',
    client_status text not null default 'otros',
    connection text not null default 'desconocido',
    source_file text,
    raw jsonb not null default '{}'::jsonb,
    imported_at timestamptz not null default now()
);

create index if not exists transaction_records_created_at_idx on public.transaction_records(created_at);
create index if not exists transaction_records_discipline_idx on public.transaction_records(discipline);
create index if not exists transaction_records_client_status_idx on public.transaction_records(client_status);
create index if not exists transaction_records_connection_idx on public.transaction_records(connection);
create index if not exists transaction_records_user_id_idx on public.transaction_records(user_id);

alter table public.transaction_records enable row level security;

create policy "viewer can read all rows"
on public.transaction_records
for select
using (
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'app_role', '') in ('viewer', 'editor', 'admin')
);

create policy "editor can insert and update rows"
on public.transaction_records
for insert
with check (
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'app_role', '') in ('editor', 'admin')
);

create policy "editor can update rows"
on public.transaction_records
for update
using (
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'app_role', '') in ('editor', 'admin')
)
with check (
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'app_role', '') in ('editor', 'admin')
);

create policy "admin can delete rows"
on public.transaction_records
for delete
using (
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'app_role', '') = 'admin'
);

create or replace view public.transaction_discipline_summary as
select
    discipline,
    client_status,
    connection,
    count(*) as records,
    sum(total) as total,
    sum(income) as income
from public.transaction_records
group by discipline, client_status, connection;

comment on table public.transaction_records is 'Registros diarios exportados del back office para dashboard y análisis.';

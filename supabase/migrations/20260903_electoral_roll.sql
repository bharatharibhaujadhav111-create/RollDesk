create extension if not exists pgcrypto;

create table if not exists public.pdf_assets (
  id text primary key,
  original_name text not null,
  storage_path text not null unique,
  village_id text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  page_count integer,
  indexed_records integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'extracting', 'ocr', 'indexing', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.index_jobs (
  id uuid primary key default gen_random_uuid(),
  pdf_id text not null references public.pdf_assets(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'extracting', 'ocr', 'indexing', 'ready', 'failed')),
  current_page integer not null default 0,
  total_pages integer,
  records_found integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.voters (
  id text primary key,
  pdf_id text not null references public.pdf_assets(id) on delete cascade,
  village_id text not null,
  page_number integer not null,
  part_number text not null,
  serial_number text,
  epic_number text,
  voter_name text not null,
  relative_name text not null default '',
  relative_label text not null,
  house_number text,
  age integer check (age between 0 and 130),
  gender text,
  confidence numeric(3,2) not null,
  voter_name_normalized text not null,
  relative_name_normalized text not null,
  created_at timestamptz not null default now()
);

create index if not exists voters_pdf_id_idx on public.voters(pdf_id);
create index if not exists voters_village_id_idx on public.voters(village_id);
create index if not exists voters_epic_number_idx on public.voters(epic_number);
create index if not exists voters_name_normalized_idx on public.voters(voter_name_normalized);
create index if not exists voters_relative_normalized_idx on public.voters(relative_name_normalized);
create index if not exists index_jobs_pdf_created_idx on public.index_jobs(pdf_id, created_at desc);

alter table public.pdf_assets enable row level security;
alter table public.index_jobs enable row level security;
alter table public.voters enable row level security;

-- This app uses the server-side service key only. Do not add public read/write
-- policies unless voter data is intentionally made public.

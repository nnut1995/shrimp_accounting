-- Shrimp Accounting schema
-- Run this once in Supabase Dashboard -> SQL Editor

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table sizes (
  code text primary key,
  label text not null,
  sort_order int not null
);

create table lots (
  id uuid primary key default gen_random_uuid(),
  buy_date date not null,
  supplier_id uuid not null references suppliers(id),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table buy_lines (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  container text not null default '',
  size_code text not null references sizes(code),
  description text not null default '',
  density text not null default '',
  weight_kg numeric(12,2) not null default 0,
  cost_per_kg numeric(12,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table sell_lines (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  sell_date date not null,
  container text not null default '',
  size_code text not null references sizes(code),
  description text not null default '',
  density text not null default '',
  weight_kg numeric(12,2) not null default 0,
  price_per_kg numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table adjustments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  amount numeric(14,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  category_id uuid not null references expense_categories(id),
  amount numeric(14,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Standalone expenses per month (overhead not tied to any lot)
create table monthly_expenses (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  category_id uuid not null references expense_categories(id),
  amount numeric(14,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Seed fixed size list
insert into sizes (code, label, sort_order) values
  ('0', '0', 1),
  ('1', '1', 2),
  ('2', '2', 3),
  ('3', '3', 4),
  ('4', '4', 5),
  ('นิ่ม/A', 'นิ่ม/A', 6),
  ('ฝอย', 'ฝอย', 7),
  ('ผอม', 'ผอม', 8),
  ('เสีย', 'เสีย', 9),
  ('ตัวอย่าง', 'ตัวอย่าง', 10);

-- Seed usual expense categories
insert into expense_categories (name) values
  ('ค่าธรรมเนียม'),
  ('ค่ารถ'),
  ('ค่าตอง'),
  ('ค่าซีล'),
  ('ซื้อน้ำแข็งเพิ่ม'),
  ('ค่าทำมือ/ผัด');

-- Row Level Security: only logged-in users can do anything
alter table suppliers enable row level security;
alter table expense_categories enable row level security;
alter table sizes enable row level security;
alter table lots enable row level security;
alter table buy_lines enable row level security;
alter table sell_lines enable row level security;
alter table adjustments enable row level security;
alter table expenses enable row level security;
alter table monthly_expenses enable row level security;

create policy "authenticated full access" on suppliers for all to authenticated using (true) with check (true);
create policy "authenticated full access" on expense_categories for all to authenticated using (true) with check (true);
create policy "authenticated full access" on sizes for all to authenticated using (true) with check (true);
create policy "authenticated full access" on lots for all to authenticated using (true) with check (true);
create policy "authenticated full access" on buy_lines for all to authenticated using (true) with check (true);
create policy "authenticated full access" on sell_lines for all to authenticated using (true) with check (true);
create policy "authenticated full access" on adjustments for all to authenticated using (true) with check (true);
create policy "authenticated full access" on expenses for all to authenticated using (true) with check (true);
create policy "authenticated full access" on monthly_expenses for all to authenticated using (true) with check (true);

create index buy_lines_lot_idx on buy_lines (lot_id);
create index sell_lines_lot_idx on sell_lines (lot_id);
create index adjustments_lot_idx on adjustments (lot_id);
create index expenses_lot_idx on expenses (lot_id);
create index lots_buy_date_idx on lots (buy_date);
create index monthly_expenses_ym_idx on monthly_expenses (year, month);

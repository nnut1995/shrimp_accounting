-- Apply after schema.sql. Runs as the caller and preserves existing shared-ledger RLS.
begin;
create table public.accounting_api_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null check (length(request_key) between 1 and 128),
  payload jsonb not null,
  -- Intentionally no FK: keep the receipt even if the lot is later deleted.
  lot_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_key)
);
alter table public.accounting_api_requests enable row level security;
create policy "own api receipts" on public.accounting_api_requests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.accounting_api_requests to authenticated;
revoke update, delete on public.accounting_api_requests from authenticated;

create or replace function public.import_accounting_lot(p_key text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  receipt public.accounting_api_requests%rowtype;
  new_id uuid := gen_random_uuid();
  supplier uuid;
  category uuid;
  item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{1,128}$' then raise exception 'Invalid idempotency key'; end if;
  -- Serializes concurrent retries; released on commit or rollback.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_key, 0));
  select * into receipt from public.accounting_api_requests
    where user_id = auth.uid() and request_key = p_key;
  if found then
    if receipt.payload <> p_payload then raise exception 'Idempotency conflict' using errcode = 'PT409'; end if;
    return jsonb_build_object('lot_id', receipt.lot_id, 'replayed', true);
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or nullif(btrim(p_payload->>'supplier'), '') is null
     or nullif(p_payload->>'buy_date', '') is null then raise exception 'Invalid lot'; end if;
  insert into public.suppliers(name) values (p_payload->>'supplier')
    on conflict(name) do update set name = excluded.name returning id into supplier;
  insert into public.lots(id,buy_date,supplier_id,note)
    values(new_id,(p_payload->>'buy_date')::date,supplier,coalesce(p_payload->>'note',''));
  for item in select value from jsonb_array_elements(p_payload->'buy_lines')
              union all select value from jsonb_array_elements(p_payload->'sell_lines') loop
    insert into public.sizes(code,label,sort_order)
      values(item->>'size_code',item->>'size_code',1000)
      on conflict(code) do nothing;
  end loop;
  insert into public.buy_lines(lot_id,container,size_code,description,density,weight_kg,cost_per_kg,note)
    select new_id,container,size_code,description,density,weight_kg,cost_per_kg,note
    from jsonb_to_recordset(p_payload->'buy_lines') as x(container text,size_code text,description text,density text,weight_kg numeric,cost_per_kg numeric,note text);
  insert into public.sell_lines(lot_id,sell_date,container,size_code,description,density,weight_kg,price_per_kg,buyer,fee_pct,fee_amount)
    select new_id,sell_date,container,size_code,description,density,weight_kg,price_per_kg,buyer,fee_pct,fee_amount
    from jsonb_to_recordset(p_payload->'sell_lines') as x(sell_date date,container text,size_code text,description text,density text,weight_kg numeric,price_per_kg numeric,buyer text,fee_pct numeric,fee_amount numeric);
  for item in select value from jsonb_array_elements(p_payload->'expenses') loop
    insert into public.expense_categories(name) values(item->>'category')
      on conflict(name) do update set name=excluded.name returning id into category;
    insert into public.expenses(lot_id,category_id,amount,note)
      values(new_id,category,(item->>'amount')::numeric,coalesce(item->>'note',''));
  end loop;
  insert into public.adjustments(lot_id,kind,amount,note)
    select new_id,kind,amount,note from jsonb_to_recordset(p_payload->'adjustments') as x(kind text,amount numeric,note text);
  insert into public.accounting_api_requests(user_id,request_key,payload,lot_id)
    values(auth.uid(),p_key,p_payload,new_id);
  return jsonb_build_object('lot_id',new_id,'replayed',false);
end;
$$;
revoke all on function public.import_accounting_lot(text,jsonb) from public, anon;
grant execute on function public.import_accounting_lot(text,jsonb) to authenticated;
commit;

-- Apply after 202609270001_accounting_lot_updates.sql.
begin;
alter table public.lots add column if not exists broker text not null default '';

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
  insert into public.lots(id,buy_date,supplier_id,note,broker)
    values(new_id,(p_payload->>'buy_date')::date,supplier,coalesce(p_payload->>'note',''),btrim(coalesce(p_payload->>'broker','')));
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

-- One statement gives the payload and version the same database snapshot.
create or replace function public.accounting_lot_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object('payload', payload, 'version', md5(payload::text)) from (
    select jsonb_build_object(
      'buy_date', l.buy_date, 'supplier', s.name, 'note', l.note, 'broker', l.broker,
      'buy_lines', coalesce((select jsonb_agg(to_jsonb(b) - 'id' - 'lot_id' - 'created_at' order by b.id) from buy_lines b where b.lot_id=l.id), '[]'::jsonb),
      'sell_lines', coalesce((select jsonb_agg((to_jsonb(b) - 'id' - 'lot_id' - 'created_at') || jsonb_build_object('fee_pct', case when b.fee_amount is not null then null else coalesce(b.fee_pct,1.2) end) order by b.id) from sell_lines b where b.lot_id=l.id), '[]'::jsonb),
      'expenses', coalesce((select jsonb_agg(jsonb_build_object('category', c.name, 'amount', e.amount, 'note', e.note) order by e.id) from expenses e join expense_categories c on c.id=e.category_id where e.lot_id=l.id), '[]'::jsonb),
      'adjustments', coalesce((select jsonb_agg(to_jsonb(a) - 'id' - 'lot_id' - 'created_at' order by a.id) from adjustments a where a.lot_id=l.id), '[]'::jsonb)
    ) payload from lots l join suppliers s on s.id=l.supplier_id where l.id=p_id
  ) snapshot;
$$;
revoke all on function public.accounting_lot_snapshot(uuid) from public, anon;
grant execute on function public.accounting_lot_snapshot(uuid) to authenticated;

create or replace function public.update_accounting_lot(p_id uuid, p_key text, p_version text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  receipt public.accounting_api_requests%rowtype;
  envelope jsonb := jsonb_build_object('operation','update','lot_id',p_id,'version',p_version,'payload',p_payload);
  current_snapshot jsonb;
  supplier uuid;
  category uuid;
  item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{1,128}$' then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_key, 0));
  select * into receipt from public.accounting_api_requests where user_id=auth.uid() and request_key=p_key;
  if found then
    if receipt.payload <> envelope then raise exception 'Idempotency conflict' using errcode = 'PT409'; end if;
    return jsonb_build_object('lot_id',receipt.lot_id,'replayed',true);
  end if;
  -- Also serialize against the existing website's direct child-table writes.
  -- Locks are brief and transaction-scoped; no model/network work happens here.
  lock table public.lots, public.buy_lines, public.sell_lines, public.expenses,
    public.adjustments, public.suppliers, public.expense_categories in share row exclusive mode;
  current_snapshot := public.accounting_lot_snapshot(p_id);
  if current_snapshot is null then raise exception 'Lot not found' using errcode='PT404'; end if;
  if p_version is null or current_snapshot->>'version' <> p_version then
    raise exception 'Lot changed; read and review again' using errcode='PT412';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or nullif(btrim(p_payload->>'supplier'),'') is null
     or nullif(p_payload->>'buy_date','') is null then raise exception 'Invalid lot'; end if;
  insert into public.suppliers(name) values(p_payload->>'supplier')
    on conflict(name) do update set name=excluded.name returning id into supplier;
  update public.lots set buy_date=(p_payload->>'buy_date')::date, supplier_id=supplier, note=coalesce(p_payload->>'note',''), broker=case when p_payload ? 'broker' then btrim(coalesce(p_payload->>'broker','')) else broker end where id=p_id;
  delete from public.buy_lines where lot_id=p_id;
  delete from public.sell_lines where lot_id=p_id;
  delete from public.expenses where lot_id=p_id;
  delete from public.adjustments where lot_id=p_id;
  for item in select value from jsonb_array_elements(p_payload->'buy_lines')
              union all select value from jsonb_array_elements(p_payload->'sell_lines') loop
    insert into public.sizes(code,label,sort_order)
      values(item->>'size_code',item->>'size_code',1000)
      on conflict(code) do nothing;
  end loop;
  insert into public.buy_lines(lot_id,container,size_code,description,density,weight_kg,cost_per_kg,note)
    select p_id,container,size_code,description,density,weight_kg,cost_per_kg,note
    from jsonb_to_recordset(p_payload->'buy_lines') as x(container text,size_code text,description text,density text,weight_kg numeric,cost_per_kg numeric,note text);
  insert into public.sell_lines(lot_id,sell_date,container,size_code,description,density,weight_kg,price_per_kg,buyer,fee_pct,fee_amount)
    select p_id,sell_date,container,size_code,description,density,weight_kg,price_per_kg,buyer,fee_pct,fee_amount
    from jsonb_to_recordset(p_payload->'sell_lines') as x(sell_date date,container text,size_code text,description text,density text,weight_kg numeric,price_per_kg numeric,buyer text,fee_pct numeric,fee_amount numeric);
  for item in select value from jsonb_array_elements(p_payload->'expenses') loop
    insert into public.expense_categories(name) values(item->>'category')
      on conflict(name) do update set name=excluded.name returning id into category;
    insert into public.expenses(lot_id,category_id,amount,note)
      values(p_id,category,(item->>'amount')::numeric,coalesce(item->>'note',''));
  end loop;
  insert into public.adjustments(lot_id,kind,amount,note)
    select p_id,kind,amount,note from jsonb_to_recordset(p_payload->'adjustments') as x(kind text,amount numeric,note text);
  insert into public.accounting_api_requests(user_id,request_key,payload,lot_id) values(auth.uid(),p_key,envelope,p_id);
  return jsonb_build_object('lot_id',p_id,'replayed',false);
end;
$$;
revoke all on function public.update_accounting_lot(uuid,text,text,jsonb) from public, anon;
grant execute on function public.update_accounting_lot(uuid,text,text,jsonb) to authenticated;
commit;

create index if not exists order_items_order_idx on public.order_items (order_id);

create or replace function public.stats_compute(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
with o as (
  select *, (created_at at time zone 'Africa/Porto-Novo') as lt from orders
  where restaurant_id = p_restaurant_id
    and created_at >= (p_from::timestamp at time zone 'Africa/Porto-Novo')
    and created_at < ((p_to + 1)::timestamp at time zone 'Africa/Porto-Novo')
), ok as (select * from o where status <> 'cancelled')
select jsonb_build_object(
  'kpis', (select jsonb_build_object(
      'orders', (select count(*) from ok),
      'cancelled', (select count(*) from o where status='cancelled'),
      'sales', (select coalesce(sum(total_fcfa),0) from ok),
      'avg_ticket', (select coalesce(round(avg(total_fcfa)),0) from ok),
      'delivery_fees', (select coalesce(sum(delivery_fee_fcfa),0) from ok),
      'discounts', (select coalesce(sum(discount_fcfa),0) from ok),
      'tips', (select coalesce(sum(tip_fcfa),0) from ok),
      'customers', (select count(distinct coalesce(customer_id::text, customer_phone)) from ok),
      'prep_min', (select round(avg(extract(epoch from ready_at - coalesce(accepted_at, created_at))/60)) from ok where ready_at is not null),
      'delivery_min', (select round(avg(extract(epoch from delivered_at - picked_up_at)/60)) from ok where delivered_at is not null and picked_up_at is not null),
      'rating', (select round(avg(rating)::numeric,1) from order_reviews r where r.restaurant_id=p_restaurant_id and r.created_at >= (p_from::timestamp at time zone 'Africa/Porto-Novo') and r.created_at < ((p_to+1)::timestamp at time zone 'Africa/Porto-Novo')),
      'ratings', (select count(*) from order_reviews r where r.restaurant_id=p_restaurant_id and r.created_at >= (p_from::timestamp at time zone 'Africa/Porto-Novo') and r.created_at < ((p_to+1)::timestamp at time zone 'Africa/Porto-Novo')))),
  'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('k',h,'orders',n,'sales',s) order by h),'[]') from (select extract(hour from lt)::int h, count(*) n, sum(total_fcfa) s from ok group by 1) x),
  'by_day', (select coalesce(jsonb_agg(jsonb_build_object('k',d,'orders',n,'sales',s) order by d),'[]') from (select lt::date d, count(*) n, sum(total_fcfa) s from ok group by 1) x),
  'by_weekday', (select coalesce(jsonb_agg(jsonb_build_object('k',d,'orders',n,'sales',s) order by d),'[]') from (select extract(isodow from lt)::int d, count(*) n, sum(total_fcfa) s from ok group by 1) x),
  'by_type', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'orders',n,'sales',s)),'[]') from (select order_type::text k, count(*) n, sum(total_fcfa) s from ok group by 1) x),
  'by_payment', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'orders',n,'sales',s)),'[]') from (select payment_method::text k, count(*) n, sum(total_fcfa) s from ok group by 1) x),
  'by_source', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'orders',n,'sales',s)),'[]') from (select coalesce(source,'app') k, count(*) n, sum(total_fcfa) s from ok group by 1) x),
  'products', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'qty',q,'sales',s) order by q desc),'[]') from (select i.item_name || coalesce(' · '||i.variant_name,'') k, sum(i.quantity) q, sum(i.line_total_fcfa) s from order_items i join ok on ok.id=i.order_id group by 1 order by 2 desc limit 20) x),
  'cashiers', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'orders',n,'sales',s) order by s desc),'[]') from (select c.full_name k, count(*) n, sum(ok.total_fcfa) s from ok join cashiers c on c.id=ok.cashier_id group by 1) x),
  'riders', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'orders',n,'minutes',m) order by n desc),'[]') from (select r.full_name k, count(*) n, round(avg(extract(epoch from ok.delivered_at-ok.picked_up_at)/60)) m from ok join riders r on r.id=ok.rider_id where ok.status='delivered' group by 1) x),
  'cancel_reasons', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'orders',n) order by n desc),'[]') from (select coalesce(nullif(btrim(cancel_reason),''),'Sans motif') k, count(*) n from o where status='cancelled' group by 1) x),
  'closures', (select coalesce(jsonb_agg(jsonb_build_object('at',cl.closed_at,'cashier',c.full_name,'orders',cl.orders_count,'expected',cl.cash_expected_fcfa,'counted',cl.cash_counted_fcfa,'gap',cl.gap_fcfa,'momo',cl.momo_total_fcfa,'note',cl.note) order by cl.closed_at desc),'[]')
      from cashier_closures cl left join cashiers c on c.id=cl.cashier_id
      where cl.restaurant_id=p_restaurant_id and cl.closed_at >= (p_from::timestamp at time zone 'Africa/Porto-Novo') and cl.closed_at < ((p_to+1)::timestamp at time zone 'Africa/Porto-Novo'))
);
$$;
revoke all on function public.stats_compute(uuid, date, date) from public, anon, authenticated;

create or replace function public.admin_stats(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_len int;
begin
  if not private.manages_restaurant(auth.uid(), p_restaurant_id) then raise exception 'Action non autorisée.'; end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'Période invalide.'; end if;
  v_len := p_to - p_from + 1;
  return public.stats_compute(p_restaurant_id, p_from, p_to)
    || jsonb_build_object('previous', public.stats_compute(p_restaurant_id, p_from - v_len, p_from - 1)->'kpis');
end $$;
revoke all on function public.admin_stats(uuid, date, date) from public, anon;
grant execute on function public.admin_stats(uuid, date, date) to authenticated;

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  report_date date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, report_date)
);
grant all on public.daily_reports to service_role;
alter table public.daily_reports enable row level security;

create or replace function public.admin_daily_reports(p_restaurant_id uuid, p_limit int default 60)
returns table(report_date date, data jsonb) language plpgsql stable security definer set search_path = public as $$
begin
  if not private.manages_restaurant(auth.uid(), p_restaurant_id) then raise exception 'Action non autorisée.'; end if;
  return query select d.report_date, d.data from daily_reports d where d.restaurant_id = p_restaurant_id order by d.report_date desc limit least(greatest(p_limit,1),400);
end $$;
revoke all on function public.admin_daily_reports(uuid, int) from public, anon;
grant execute on function public.admin_daily_reports(uuid, int) to authenticated;

create or replace function public.daily_report_tick()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_day date := (now() at time zone 'Africa/Porto-Novo')::date - 1; s jsonb; k jsonb; n int := 0;
begin
  for r in select id, name from restaurants where is_active loop
    s := public.stats_compute(r.id, v_day, v_day)
      || jsonb_build_object('previous', public.stats_compute(r.id, v_day - 7, v_day - 7)->'kpis');
    insert into daily_reports(restaurant_id, report_date, data) values (r.id, v_day, s)
      on conflict (restaurant_id, report_date) do update set data = excluded.data, created_at = now();
    k := s->'kpis';
    insert into notifications(user_id, title, body)
    select distinct ur.user_id, 'Résumé du ' || to_char(v_day, 'DD/MM'),
      (k->>'orders') || ' commandes · ' || (k->>'sales') || ' F · panier moyen ' || (k->>'avg_ticket') || ' F · ' || (k->>'cancelled') || ' annulées'
    from user_roles ur where ur.role = 'restaurant_admin' and ur.restaurant_id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.daily_report_tick() from public, anon, authenticated;
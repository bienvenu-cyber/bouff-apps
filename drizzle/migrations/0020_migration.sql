create or replace function public.admin_order_breakdown(p_restaurant_id uuid, p_from date default null, p_to date default null)
returns table(order_type text, is_cash boolean, orders bigint, sales bigint, fees bigint)
language sql stable security invoker set search_path = public as $$
  select o.order_type::text, o.payment_method = 'cash', count(*), coalesce(sum(o.total_fcfa),0), coalesce(sum(o.delivery_fee_fcfa),0)
  from orders o
  where o.restaurant_id = p_restaurant_id and o.status <> 'cancelled'
    and (p_from is null or o.created_at >= (p_from::timestamp at time zone 'Africa/Porto-Novo'))
    and (p_to is null or o.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Porto-Novo'))
  group by 1, 2;
$$;
grant execute on function public.admin_order_breakdown(uuid, date, date) to authenticated;
create index if not exists orders_restaurant_created_idx on public.orders (restaurant_id, created_at);
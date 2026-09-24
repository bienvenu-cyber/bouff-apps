import { ApolloLink, Observable } from '@apollo/client';
import type { FieldNode } from 'graphql';
import { bouffDb } from './supabase';
import { argsOf, operationOf, project } from './project';
import { BouffError, fetchOrder, resolvers } from './resolvers';

/**
 * Passerelle BOUFF : l'admin d'origine continue de « parler GraphQL »,
 * les réponses viennent de la base BOUFF.
 */
export function createBouffLink(): ApolloLink {
  return new ApolloLink(
    (operation) =>
      new Observable<any>((observer) => {
        const { op, fragments } = operationOf(operation.query);
        const vars = operation.variables ?? {};
        const fields = op.selectionSet.selections.filter(
          (s): s is FieldNode => s.kind === 'Field'
        );

        if (op.operation === 'subscription') {
          return subscribe(fields[0], vars, fragments, observer);
        }

        let cancelled = false;
        (async () => {
          const data: Record<string, any> = {};
          for (const f of fields) {
            const key = f.alias?.value ?? f.name.value;
            if (f.directives?.some((d) => d.name.value === 'client')) continue;
            const resolver = resolvers[f.name.value];
            if (!resolver) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`[BOUFF] champ non branché : ${f.name.value}`);
              }
              data[key] = null;
              continue;
            }
            const value = await resolver(argsOf(f, vars));
            data[key] = project(value, f.selectionSet, fragments);
          }
          return data;
        })()
          .then((data) => {
            if (cancelled) return;
            observer.next({ data });
            observer.complete();
          })
          .catch((e: any) => {
            if (cancelled) return;
            observer.next({
              data: null,
              errors: [
                {
                  message: e?.message ?? 'Erreur inattendue.',
                  extensions: { code: e instanceof BouffError ? e.code : 'INTERNAL' },
                },
              ],
            });
            observer.complete();
          });
        return () => {
          cancelled = true;
        };
      })
  );
}

function subscribe(field: FieldNode, vars: any, fragments: any, observer: any) {
  const db = bouffDb();
  const name = field.name.value;
  const args = argsOf(field, vars);
  const filter =
    name === 'subscriptionOrder' || name === 'orderTracking'
      ? `id=eq.${args.id}`
      : args.restaurant
        ? `restaurant_id=eq.${args.restaurant}`
        : undefined;
  let stopped = false;
  const channel = db
    .channel(`bouff-admin-${name}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', ...(filter ? { filter } : {}) },
      async (payload: any) => {
        const row = payload.new;
        if (!row?.id) return;
        if (payload.eventType === 'INSERT') await new Promise((r) => setTimeout(r, 1500));
        const order = await fetchOrder(row.id).catch(() => null);
        if (!order || stopped) return;
        const value =
          name === 'subscribePlaceOrder'
            ? { __typename: 'SubscriptionOrders', userId: row.customer_id, origin: payload.eventType === 'INSERT' ? 'new' : 'update', order }
            : order;
        observer.next({ data: { [field.alias?.value ?? name]: project(value, field.selectionSet, fragments) } });
      }
    )
    .subscribe();
  return () => {
    stopped = true;
    void db.removeChannel(channel);
  };
}

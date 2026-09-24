"use client";

import { gql, useMutation, useQuery, useSubscription } from "@apollo/client";
import { useEffect, useRef, useState } from "react";

const CHAT = gql`
  query Chat($order: ID!) {
    chat(order: $order) {
      id
      message
      user {
        id
        name
      }
      createdAt
    }
  }
`;
const SEND = gql`
  mutation SendChatMessage($orderId: ID!, $messageInput: ChatMessageInput!) {
    sendChatMessage(message: $messageInput, orderId: $orderId) {
      success
      message
      data {
        id
        message
        user {
          id
          name
        }
        createdAt
      }
    }
  }
`;
const NEW_MESSAGE = gql`
  subscription SubscriptionNewMessage($order: ID!) {
    subscriptionNewMessage(order: $order) {
      id
      message
      user {
        id
        name
      }
      createdAt
    }
  }
`;

type Msg = { id: string; message: string; user: { id: string; name: string }; createdAt: string };

/** Chat client ↔ livreur, ouvert pendant la livraison. */
export default function RiderChat({ order, riderName }: { order: string; riderName?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery(CHAT, {
    variables: { order },
    skip: !open,
    fetchPolicy: "network-only",
  });
  const { data: live } = useSubscription(NEW_MESSAGE, {
    variables: { order },
    skip: !open,
  });
  const [send, { loading }] = useMutation(SEND);

  const add = (list: Msg[]) =>
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      list.forEach((m) => byId.set(m.id, m));
      return [...byId.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });

  useEffect(() => {
    if (data?.chat) add(data.chat);
  }, [data]);
  useEffect(() => {
    if (live?.subscriptionNewMessage) add([live.subscriptionNewMessage]);
  }, [live]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || loading) return;
    setError(null);
    const res = await send({
      variables: { orderId: order, messageInput: { message: body, user: { id: "customer", name: "Client" } } },
    }).catch((err) => ({ data: { sendChatMessage: { success: false, message: err.message } } }));
    const out = res.data?.sendChatMessage;
    if (!out?.success) {
      setError(out?.message ?? "Message non envoyé.");
      return;
    }
    if (out.data) add([out.data]);
    setText("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 block min-h-11 w-full rounded-bouff-md border border-bouff-primary px-5 py-3 text-center text-sm font-semibold text-bouff-primary transition hover:bg-bouff-primary-soft md:max-w-xs"
      >
        Écrire au livreur
      </button>
    );
  }

  return (
    <section
      aria-label="Chat avec le livreur"
      className="mt-3 flex h-[420px] w-full flex-col overflow-hidden rounded-bouff-md border border-bouff-line bg-bouff-surface text-bouff-text md:w-80"
    >
      <header className="flex items-center justify-between border-b border-bouff-line px-4 py-3">
        <p className="text-sm font-semibold">{riderName ? `Chat · ${riderName}` : "Chat avec le livreur"}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer le chat"
          className="text-bouff-text-muted hover:text-bouff-text"
        >
          <i className="pi pi-times" aria-hidden />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-bouff-text-muted">
            Aucun message. Précisez un repère ou posez une question au livreur.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.user.id === "customer";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-bouff-md px-3 py-2 text-sm ${
                  mine ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised text-bouff-text"
                }`}
              >
                {!mine && <p className="mb-0.5 text-xs font-semibold opacity-80">{m.user.name}</p>}
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                <p className="mt-1 text-[10px] opacity-70">
                  {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="px-3 pb-1 text-xs text-bouff-danger">{error}</p>}
      <form onSubmit={onSend} className="flex gap-2 border-t border-bouff-line p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Votre message…"
          aria-label="Votre message"
          className="min-w-0 flex-1 rounded-bouff-sm border border-bouff-line bg-bouff-background px-3 py-2 text-sm text-bouff-text placeholder:text-bouff-text-muted focus:border-bouff-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          aria-label="Envoyer"
          className="rounded-bouff-sm bg-bouff-primary px-3 text-bouff-on-primary disabled:opacity-50"
        >
          <i className="pi pi-send" aria-hidden />
        </button>
      </form>
    </section>
  );
}

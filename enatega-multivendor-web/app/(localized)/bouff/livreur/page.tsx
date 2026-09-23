"use client";

import { useCallback, useEffect, useState } from "react";
import { bouffDb, fcfa, RIDER_STATUS_LABEL, STATUS_LABEL } from "@/lib/bouff/client";
import { StaffGate } from "@/lib/bouff/StaffGate";
import { useToast } from "@/lib/bouff/toast";

type Rider = { id: string; full_name: string; status: string; restaurant_id: string };
type Course = {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  total_fcfa: number;
  delivery_fee_fcfa: number;
  rider_id: string | null;
  created_at: string;
};

export default function LivreurPage() {
  return <StaffGate title="Espace livreur">{() => <RiderBoard />}</StaffGate>;
}

function RiderBoard() {
  const toast = useToast();
  const [rider, setRider] = useState<Rider | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data: me } = await bouffDb
      .from("riders")
      .select("id, full_name, status, restaurant_id")
      .maybeSingle();
    setRider((me as Rider) ?? null);

    const { data } = await bouffDb
      .from("orders")
      .select(
        "id, order_number, status, customer_name, customer_phone, delivery_address, total_fcfa, delivery_fee_fcfa, rider_id, created_at",
      )
      .eq("order_type", "delivery")
      .in("status", ["in_kitchen", "ready", "on_the_way"])
      .order("created_at", { ascending: true });
    setCourses((data ?? []) as Course[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const channel = bouffDb
      .channel("bouff-rider")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => {
      bouffDb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: string, args: Record<string, unknown>, okMessage: string) => {
    const { error } = await bouffDb.rpc(fn, args);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      load();
      return;
    }
    toast.success(okMessage);
    load();
  };

  if (loaded && !rider) {
    return (
      <p className="py-10 text-center text-white/60">
        Ce compte n'est pas encore rattaché à un livreur. Demandez à l'administrateur de le créer.
      </p>
    );
  }

  const mine = courses.filter((c) => c.rider_id === rider?.id);
  const free = courses.filter((c) => !c.rider_id);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#131315] p-4">
        <span className="font-semibold">{rider?.full_name}</span>
        <span className="rounded-full bg-[#ff7a1a]/20 px-3 py-1 text-xs font-semibold text-[#ffc043]">
          {RIDER_STATUS_LABEL[rider?.status ?? "offline"]}
        </span>
        <div className="ml-auto flex gap-2">
          {rider?.status === "available" ? (
            <button
              onClick={() => run("set_rider_status", { p_status: "offline" }, "Hors ligne.")}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm"
            >
              Passer hors ligne
            </button>
          ) : rider?.status === "offline" ? (
            <button
              onClick={() => run("set_rider_status", { p_status: "available" }, "Disponible !")}
              className="rounded-xl bg-[#ff7a1a] px-3 py-2 text-sm font-bold text-black"
            >
              Je suis disponible
            </button>
          ) : null}
        </div>
      </div>

      <h2 className="mt-6 text-lg font-bold">Mes courses</h2>
      {mine.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">Aucune course en cours.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {mine.map((c) => (
            <CourseCard key={c.id} course={c}>
              {c.status === "ready" ? (
                <button
                  onClick={() =>
                    run(
                      "rider_advance_order",
                      { p_order_id: c.id, p_status: "on_the_way" },
                      `${c.order_number} : en route.`,
                    )
                  }
                  className="rounded-xl bg-[#ff7a1a] px-3 py-2 text-sm font-bold text-black"
                >
                  J'ai récupéré la commande
                </button>
              ) : null}
              {c.status === "on_the_way" ? (
                <button
                  onClick={() =>
                    run(
                      "rider_advance_order",
                      { p_order_id: c.id, p_status: "delivered" },
                      `${c.order_number} livrée.`,
                    )
                  }
                  className="rounded-xl bg-[#ff7a1a] px-3 py-2 text-sm font-bold text-black"
                >
                  Commande remise
                </button>
              ) : null}
              {c.status === "in_kitchen" ? (
                <span className="text-sm text-white/60">En préparation…</span>
              ) : null}
              <a
                href={`tel:${c.customer_phone}`}
                className="rounded-xl border border-white/15 px-3 py-2 text-sm"
              >
                Appeler le client
              </a>
            </CourseCard>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-lg font-bold">Courses disponibles</h2>
      {free.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">Aucune course libre pour le moment.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {free.map((c) => (
            <CourseCard key={c.id} course={c}>
              <button
                onClick={() =>
                  run("claim_order", { p_order_id: c.id }, `${c.order_number} prise en charge.`)
                }
                className="rounded-xl bg-[#ff7a1a] px-3 py-2 text-sm font-bold text-black"
              >
                Prendre la course
              </button>
            </CourseCard>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  children,
}: {
  course: Course;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#131315] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold">{course.order_number}</p>
          <p className="text-sm text-white/60">
            {course.customer_name} · {course.customer_phone}
          </p>
          {course.delivery_address ? (
            <p className="text-sm text-white/70">{course.delivery_address}</p>
          ) : null}
        </div>
        <span className="rounded-full bg-[#ff7a1a]/20 px-3 py-1 text-xs font-semibold text-[#ffc043]">
          {STATUS_LABEL[course.status]}
        </span>
      </div>
      <p className="mt-2 text-sm">
        À encaisser : <span className="font-bold">{fcfa(course.total_fcfa)}</span> · livraison{" "}
        {fcfa(course.delivery_fee_fcfa)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

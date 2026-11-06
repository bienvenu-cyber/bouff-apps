// Retour du client après la page de paiement par carte FeexPay.
// Le paramètre « status » de l'URL est ignoré : le paiement est revérifié chez FeexPay.
import { returnLocation } from "@/lib/server/feexpay";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ target: string; order: string }> },
) {
  const { target, order } = await params;
  const url = new URL(request.url);
  const location = await returnLocation(target === "app" ? "app" : "web", decodeURIComponent(order), url.searchParams.get("ref"));
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

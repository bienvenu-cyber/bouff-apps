import { useMutation } from "@apollo/client";
import { MARK_ORDER_READY } from "../apollo/mutations/order.mutation";
import { FlashMessageComponent } from "../ui/useable-components";

// BOUFF : la cuisine indique que la commande est prête.
export default function useMarkOrderReady() {
  const [mutate, { loading }] = useMutation(MARK_ORDER_READY);
  const markReady = async (_id: string) => {
    try {
      await mutate({ variables: { _id } });
    } catch (error) {
      FlashMessageComponent({
        message: (error as Error).message || "Action impossible",
      });
    }
  };
  return { loading, markReady };
}

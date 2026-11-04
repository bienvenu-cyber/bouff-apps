import { useMutation } from "@apollo/client";
import { PICK_UP_ORDER } from "../apollo/mutations/order.mutation";
import { FlashMessageComponent } from "../ui/useable-components";

export default function useOrderPickedUp() {
  const [mutatePickedUp, { loading, error }] = useMutation(PICK_UP_ORDER);
  const pickedUpOrderFunc = async (_id: string) => {
    try {
      await mutatePickedUp({ variables: { _id } });
    } catch (error) {
      FlashMessageComponent({ message: error instanceof Error ? error.message : "Remise impossible" });
    }
  };

  return { loading, error, pickedUp: pickedUpOrderFunc };
}

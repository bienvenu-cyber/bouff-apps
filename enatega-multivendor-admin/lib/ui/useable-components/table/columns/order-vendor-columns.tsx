import { formatDateFr } from '@/lib/utils/methods/bouff-date';
import { IExtendedOrder } from '@/lib/utils/interfaces';
import { useTranslations } from 'next-intl';
const dateOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: true,
};

export const ORDER_COLUMNS = () => {
  // Hooks
  const t = useTranslations();
  return [
    {
      headerName: t('Order ID'),
      propertyName: 'orderId',
    },
    {
      propertyName: 'itemsTitle',
      headerName: t('Items'),
    },
    {
      headerName: t('Payment'),
      propertyName: 'paymentMethod',
    },
    {
      headerName: t('Order Status'),
      propertyName: 'orderStatus',
      body: (rowData: IExtendedOrder) => {
        const labels: Record<string, string> = {
          PENDING: 'Reçue',
          ACCEPTED: 'En cuisine',
          ASSIGNED: 'Livreur assigné',
          PICKED: 'En route',
          DELIVERED: 'Livrée',
          COMPLETED: 'Terminée',
          CANCELLED: 'Annulée',
          CANCELLEDBYREST: 'Refusée',
        };
        const status = String(rowData.orderStatus ?? '');
        return <span>{labels[status] ?? status}</span>;
      },
    },
    {
      headerName: t('Created At'),
      propertyName: 'DateCreated',
      body: (rowData: IExtendedOrder) => {
        const formatedDate = formatDateFr(rowData?.createdAt, dateOptions);
        return <span>{formatedDate}</span>;
      },
    },
    {
      headerName: t('Delivery Address'),
      propertyName: 'OrderdeliveryAddress',
    },
  ];
};

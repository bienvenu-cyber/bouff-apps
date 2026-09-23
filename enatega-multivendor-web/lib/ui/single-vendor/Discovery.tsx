"use client";

import { useQuery } from "@apollo/client";

import { SINGLE_VENDOR_DISCOVERY } from "@/lib/api/graphql/single-vendor";
import { getSingleVendorDealPricing } from "@/lib/mode/singleVendorPricing";
import type { ModeProduct } from "@/lib/mode/types";
import BouffHero from "./BouffHero";
import CategoryChips, { sectionAnchor } from "./CategoryChips";
import CartBar from "./CartBar";

import SingleVendorProductSection, {
  SingleVendorProductSectionSkeleton,
} from "./ProductSection";
import SingleVendorActiveOrderCard from "./ActiveOrderCard";
import { useTranslations } from "next-intl";

const normalizeProducts = (items: any[] = []): ModeProduct[] =>
  items.map((item) => ({
    id: item.id || item._id,
    title: item.title,
    description: item.description,
    image: item.image,
    categoryId: item.categoryId,
    isOutOfStock: Boolean(item.isOutOfStock ?? item.outofstock),
    variations: (item.variations || []).map((variation: any) => {
      const { finalPrice } = getSingleVendorDealPricing(
        variation.price,
        variation.deal,
      );

      return {
        id: variation.id || variation._id,
        title: variation.title,
        name: variation.name,
        price: Number(variation.price) || 0,
        discountedPrice:
          variation.discountedUnitPrice == null
            ? finalPrice
            : Number(variation.discountedUnitPrice),
        isOutOfStock: Boolean(variation.isOutOfStock ?? variation.outofstock),
        deal: variation.deal,
      };
    }),
  }));

function SectionError({ message }: { message: string }) {
  return (
    <div className="mt-7 rounded-bouff-md border border-bouff-danger px-4 py-8 text-center text-sm text-bouff-danger">
      {message}
    </div>
  );
}

export default function SingleVendorDiscovery() {
  const t = useTranslations();
  const dealsSectionTitle = t("tab_deals");
  const discovery = useQuery(SINGLE_VENDOR_DISCOVERY, {
    variables: { previewLimit: 10, dealLimit: 20 },
    fetchPolicy: "cache-and-network",
  });
  const discoveryData = discovery.data?.singleVendorDiscovery;

  const categoryData = (discoveryData?.categories || []).map(
    (category: any) => ({
      _id: category.id,
      name: category.name,
      description: category.description,
      image: category.image || category.icon,
      shopType: "single-vendor",
      slug: category.id,
    }),
  );
  const catalogData = discoveryData?.categories || [];
  const dealProducts = normalizeProducts([
    ...(discoveryData?.deals?.limitedTime?.items || []),
    ...(discoveryData?.deals?.weekly?.items || []),
  ]).filter(
    (product, index, products) =>
      products.findIndex((candidate) => candidate.id === product.id) === index,
  );

  const chips = catalogData
    .filter((c: any) => (c.items || []).length)
    .map((c: any) => ({ id: c.id, name: c.name }));

  return (
    <div className="pb-32 md:pb-24">
      <BouffHero />

      {chips.length > 0 && <CategoryChips categories={chips} />}

      <SingleVendorActiveOrderCard />

      {discovery.loading && !discovery.data ? (
        <SingleVendorProductSectionSkeleton />
      ) : (
        <SingleVendorProductSection
          title={dealsSectionTitle}
          products={dealProducts}
        />
      )}

      {discovery.loading && !catalogData.length ? (
        <SingleVendorProductSectionSkeleton />
      ) : discovery.error ? (
        <SectionError message={t("something_went_wrong_please_try_again")} />
      ) : (
        catalogData.map((category: any) => (
          <SingleVendorProductSection
            key={category.id}
            id={sectionAnchor(category.id)}
            layout="grid"
            title={category.name}
            products={normalizeProducts(category.items).map((product) => ({
              ...product,
              categoryId: category.id,
            }))}
          />
        ))
      )}

      <CartBar />
    </div>
  );
}

export { normalizeProducts };

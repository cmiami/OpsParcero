/**
 * @/config/products — product bucket + product-type configuration.
 *
 * The three top-level product filters (SaaS / Datto BCDR / Endpoint Backup) and
 * the map from the six fine-grained ProductTypes to their label + bucket.
 * Accent token names are kept in lockstep with PRODUCT_META in @/lib/status.
 */

import { Cloud, Server, HardDrive, type LucideIcon } from "lucide-react";
import type { ProductBucket, ProductType } from "@/types";
import { productTypeToBucket } from "@/types";

export interface ProductBucketConfig {
  key: ProductBucket;
  label: string;
  /** One-line description for filter chips / empty states. */
  blurb: string;
  icon: LucideIcon;
  textClass: string;
  accentClass: string;
}

/** Ordered for the product filter bar. */
export const PRODUCT_BUCKETS: ProductBucketConfig[] = [
  {
    key: "bcdr",
    label: "Datto BCDR",
    blurb: "SIRIS / ALTO appliances, agents, and Recovery Launchpad",
    icon: Server,
    textClass: "text-product-bcdr",
    accentClass: "bg-product-bcdr",
  },
  {
    key: "saas",
    label: "SaaS",
    blurb: "Spanning — Microsoft 365, Google Workspace, and Salesforce",
    icon: Cloud,
    textClass: "text-product-saas",
    accentClass: "bg-product-saas",
  },
  {
    key: "endpoint",
    label: "Endpoint Backup",
    blurb: "Kaseya Endpoint Backup v2 — direct-to-cloud image backup",
    icon: HardDrive,
    textClass: "text-product-endpoint",
    accentClass: "bg-product-endpoint",
  },
];

/** Lookup by bucket key. */
export const PRODUCT_BUCKET_BY_KEY: Record<ProductBucket, ProductBucketConfig> =
  PRODUCT_BUCKETS.reduce(
    (acc, cfg) => {
      acc[cfg.key] = cfg;
      return acc;
    },
    {} as Record<ProductBucket, ProductBucketConfig>,
  );

export interface ProductTypeConfig {
  key: ProductType;
  label: string;
  bucket: ProductBucket;
  /** Legacy/sunset types are de-emphasized in the UI. */
  legacy?: boolean;
}

/** The six surfaced product types → label + bucket. */
export const PRODUCT_TYPES: Record<ProductType, ProductTypeConfig> = {
  bcdr: { key: "bcdr", label: "Datto BCDR", bucket: "bcdr" },
  "datto-cloud": {
    key: "datto-cloud",
    label: "Datto Cloud DR",
    bucket: productTypeToBucket("datto-cloud"),
  },
  "saas-protect": {
    key: "saas-protect",
    label: "SaaS Protect",
    bucket: "saas",
  },
  spanning: { key: "spanning", label: "Spanning", bucket: "saas" },
  "endpoint-v2": {
    key: "endpoint-v2",
    label: "Endpoint Backup v2",
    bucket: "endpoint",
  },
  "endpoint-v1": {
    key: "endpoint-v1",
    label: "Endpoint Backup v1",
    bucket: "endpoint",
    legacy: true,
  },
};

/** Resolve the bucket config for a fine-grained product type. */
export function productConfig(p: ProductType): ProductBucketConfig {
  return PRODUCT_BUCKET_BY_KEY[productTypeToBucket(p)];
}

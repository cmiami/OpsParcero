import { getAssets } from "@/mock/query";
import { AssetDetailView } from "./asset-detail-view";

// Static export: pre-render a page per seeded asset.
export const dynamicParams = false;
export function generateStaticParams() {
  return getAssets({}, undefined, 0, 100000).items.map((a) => ({
    assetId: String(a.id),
  }));
}

export default function AssetDetailPage() {
  return <AssetDetailView />;
}

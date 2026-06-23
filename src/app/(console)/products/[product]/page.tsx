import { ProductLensView } from "./product-lens-view";

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ product: "bcdr" }, { product: "saas" }, { product: "endpoint" }];
}

export default function ProductLensPage() {
  return <ProductLensView />;
}

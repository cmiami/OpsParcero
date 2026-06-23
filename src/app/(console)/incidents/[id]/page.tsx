import { getIncidents } from "@/mock/query";
import { IncidentDetailView } from "./incident-detail-view";

export const dynamicParams = false;
export function generateStaticParams() {
  return getIncidents().map((i) => ({ id: String(i.id) }));
}

export default function IncidentDetailPage() {
  return <IncidentDetailView />;
}

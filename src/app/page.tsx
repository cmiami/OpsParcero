import { redirect } from "next/navigation";

/** The module lands on the Resolution Center — issues grouped by category. */
export default function Home() {
  redirect("/resolution");
}

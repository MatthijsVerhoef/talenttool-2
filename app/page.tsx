import { CoachDashboard } from "@/components/coach-dashboard";
import { getClients } from "@/lib/data/store";

export default async function Home() {
  const clients = await getClients();
  return <CoachDashboard clients={clients} />;
}

import { FranchisesClient } from '@/components/franchises-client';
import { getFranchises } from '@/lib/data';

export default async function FranchisesPage() {
  const franchises = await getFranchises();
  return <FranchisesClient franchises={franchises} />;
}

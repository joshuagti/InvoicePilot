import { SupplierSpendPanel } from "@/components/suppliers/supplier-spend-panel";

export default async function SupplierSpendPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierSpendPanel supplierId={id} />;
}

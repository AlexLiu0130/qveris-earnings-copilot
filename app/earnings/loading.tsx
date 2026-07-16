export default function EarningsLoading() {
  return (
    <div className="space-y-5 py-8">
      <div className="h-10 w-56 animate-pulse bg-surface-2" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="panel h-64 animate-pulse bg-surface-2" />
        <div className="panel h-64 animate-pulse bg-surface-2" />
      </div>
    </div>
  );
}

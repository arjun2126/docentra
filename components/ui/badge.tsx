import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  draft: "bg-muted text-foreground",
  submitted: "bg-blue-100 text-blue-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        STYLES[status] ?? "bg-muted text-foreground",
        className,
      )}
    >
      {status}
    </span>
  );
}

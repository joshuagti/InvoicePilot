import { ReviewQueue } from "@/components/review/review-queue";

export default function ReviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="text-sm text-[var(--muted)]">
          Items where the system could not auto-classify with enough confidence, or still need review.
          Missing amounts do not exclude an item; they show as a dash until set.
        </p>
      </div>
      <ReviewQueue />
    </div>
  );
}

import { NewReviewForm } from "./new-review-form";

export default function NewReviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">New Review</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-400">Submitted code is reviewed as untrusted data and never executed.</p>
      <NewReviewForm />
    </div>
  );
}

export type Feedback = { kind: 'error' | 'success' | 'progress'; text: string };

const styles = {
  error: 'border-red-300 bg-red-50 text-red-800',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  progress: 'border-blue-200 bg-blue-50 text-blue-800',
};

export default function FeedbackMessage({ kind, text }: Feedback) {
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm font-medium ${styles[kind]}`}>
    {kind === 'success' && <span aria-hidden="true" className="mr-2">✓</span>}{text}
  </p>;
}

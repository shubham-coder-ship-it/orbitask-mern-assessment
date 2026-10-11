import { useId } from 'react';

// Label + control + inline error wired together for accessibility.
export default function Field({ label, error, required, children, hint }) {
  const id = useId();
  const control = children({ id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? `${id}-err` : undefined });
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      {control}
      {hint && !error && <span className="small muted">{hint}</span>}
      {error && <span className="field-error" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

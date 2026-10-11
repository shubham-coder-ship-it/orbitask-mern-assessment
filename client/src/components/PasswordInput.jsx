import { useState } from 'react';
import Icon from './Icon.jsx';

// Password field with a show/hide toggle. Used ONLY on the Sign In form (by design).
// The toggle is a real <button type="button"> so it is keyboard reachable and never submits the form.
export default function PasswordInput({ id, className = 'input', ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} id={id} className={className} type={shown ? 'text' : 'password'} />
      <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} aria-controls={id}>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}

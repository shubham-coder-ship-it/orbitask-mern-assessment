import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { LoginPage, RegisterPage } from '../pages/AuthPages.jsx';
import { ForgotPasswordPage, ResetPasswordPage } from '../pages/PasswordPages.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ login: vi.fn(), register: vi.fn() }) }));
const wrap = (ui, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe('Sign in password toggle', () => {
  it('toggles visibility, updates its accessible name, and does not submit the form', async () => {
    const user = userEvent.setup();
    wrap(<LoginPage />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('type', 'button');
    await user.type(input, 'Secret123');
    await user.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('Secret123');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    wrap(<LoginPage />);
    screen.getByRole('button', { name: 'Show password' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });
  it('links to forgot password', () => {
    wrap(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
  });
});

describe('No toggle anywhere else', () => {
  it.each([
    ['register', <RegisterPage key="r" />, '/'],
    ['forgot', <ForgotPasswordPage key="f" />, '/'],
    ['reset', <ResetPasswordPage key="x" />, '/reset-password?token=abcdefghijklmnopqrstuvwxyz'],
  ])('%s page has no show/hide button', (_n, ui, path) => {
    wrap(ui, path);
    expect(screen.queryByRole('button', { name: /show password|hide password/i })).toBeNull();
  });
});

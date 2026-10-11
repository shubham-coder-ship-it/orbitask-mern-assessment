import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="auth-wrap"><div className="auth-card" style={{ textAlign: 'center' }}>
      <h1>Page not found</h1>
      <p className="lead">The page you are looking for does not exist or has moved.</p>
      <Link className="btn btn-primary" to="/dashboard">Go to Overview</Link>
    </div></div>
  );
}

import AccountDropdown from './AccountDropdown';
import ShipAnimation from './ShipAnimation';
import Link from 'next/link';

import { useRouter } from 'next/router';

export default function Header() {
  const router = useRouter();

  return (
    <header className="header">
      <div className="header-container">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div className="logo">
            <ShipAnimation className="logo-ship-animation" />
            <h1>Will It Ship?</h1>
          </div>
        </Link>

        <nav className="header-nav" style={{ display: 'flex', gap: '2rem', marginLeft: '3rem', marginRight: 'auto' }}>
          <Link href="/" className={`nav-link ${router.pathname === '/' ? 'active' : ''}`}>My Shipments</Link>
          <Link href="/dashboard" className={`nav-link ${router.pathname === '/dashboard' ? 'active' : ''}`}>Market Overview</Link>
          <Link href="/dashboard/map" className={`nav-link ${router.pathname === '/dashboard/map' ? 'active' : ''}`}>Global Map</Link>
        </nav>

        <AccountDropdown />
      </div>
      <style jsx>{`
        .nav-link {
            color: var(--color-text-secondary);
            text-decoration: none;
            font-weight: 600;
            font-size: 0.95rem;
            transition: color 0.2s;
        }
        .nav-link:hover,
        .nav-link.active {
            color: var(--color-text-primary);
            border-bottom: 2px solid var(--color-text-primary);
        }
      `}</style>
    </header>
  );
}


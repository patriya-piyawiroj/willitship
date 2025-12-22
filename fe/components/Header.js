import AccountDropdown from './AccountDropdown';
import ShipAnimation from './ShipAnimation';

export default function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <ShipAnimation className="logo-ship-animation" />
          <h1>Will It Ship?</h1>
        </div>
        <AccountDropdown />
      </div>
    </header>
  );
}


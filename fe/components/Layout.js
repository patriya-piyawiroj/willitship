import Header from './Header';
import ActivityLog from './ActivityLog';
import { useApp } from '../contexts/AppContext';

export default function Layout({ children }) {
  const { wallets, currentAccount } = useApp();
  const currentWallet = wallets?.[currentAccount];

  return (
    <>
      <Header />
      <main className="main-content">
        <div className="content-container">
          <aside className="sidebar">
            <div className="sidebar-section">
              <h2 className="section-title">Account Balance</h2>
              <div className="info-card">
                <div className="info-item">
                  <span className="info-label">ETH:</span>
                  <span className="info-value">
                    {currentWallet?.balance?.eth !== undefined
                      ? `${currentWallet.balance.eth.toFixed(4)} ETH`
                      : '-'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Stablecoin:</span>
                  <span className="info-value">
                    {currentWallet?.balance?.stablecoin !== undefined
                      ? `${currentWallet.balance.stablecoin.toFixed(2)}`
                      : '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="sidebar-section">
              <h2 className="section-title">Activity Log</h2>
              <ActivityLog />
            </div>
          </aside>

          <section className="main-panel">
            <div className="panel-content">
              {children}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}


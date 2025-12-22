import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { ICONS } from '../lib/config';
import { formatAddress } from '../lib/utils';

export default function AccountDropdown() {
  const { currentAccount, setCurrentAccount, wallets, walletsLoading } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!wallets || walletsLoading) {
    return (
      <div className="account-dropdown-container">
        <button className="account-button" disabled>
          <span className="account-label">Loading...</span>
        </button>
      </div>
    );
  }

  const currentWallet = wallets[currentAccount];
  if (!currentWallet) {
    return (
      <div className="account-dropdown-container">
        <button className="account-button" disabled>
          <span className="account-label">No wallet</span>
        </button>
      </div>
    );
  }

  const accountTypes = ['buyer', 'seller', 'carrier', 'investor'];

  const handleSelect = (accountType) => {
    setCurrentAccount(accountType);
    setIsOpen(false);
  };

  return (
    <div className="account-dropdown-container">
      <button
        ref={buttonRef}
        className={`account-button ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select account"
      >
        <svg className="account-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS[currentWallet.icon] || ICONS.user} />
        </svg>
        <span className="account-label">{currentWallet.label}</span>
        <svg className="dropdown-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.chevronDown} />
        </svg>
      </button>
      <div ref={dropdownRef} className={`account-dropdown ${isOpen ? 'show' : ''}`}>
        {accountTypes.map((accountType) => {
          const wallet = wallets[accountType];
          if (!wallet) return null;
          return (
            <button
              key={accountType}
              className={`account-option ${currentAccount === accountType ? 'active' : ''}`}
              onClick={() => handleSelect(accountType)}
            >
              <svg className="option-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS[wallet.icon] || ICONS.user} />
              </svg>
              <div className="option-info">
                <span className="option-label">{wallet.label}</span>
                <span className="option-address">{formatAddress(wallet.address)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


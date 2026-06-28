'use client';
import { useTheme } from '@/context/ThemeProvider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/utils/firebase';
import { FiMoon, FiSun, FiLogOut, FiMenu, FiActivity } from 'react-icons/fi';

export const NavBar = () => {
  const { theme, toggleTheme } = useTheme();
  const currentPathName = usePathname();
  const logoutModalRef = useRef<HTMLDialogElement>(null);

  const handleLogoutConfirm = async () => {
    logoutModalRef.current?.close();
    try {
      await signOut(auth);
      console.log('User is logged out');
    } catch (err) {
      console.error('Logout error: ', err);
    }
  };

  const closeDropdown = () => {
    if (typeof document !== 'undefined') {
      const elem = document.activeElement as HTMLElement;
      if (elem) {
        elem.blur();
      }
    }
  };

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/positions', label: 'Positions' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/options', label: 'Options' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/debts', label: 'Debts' },
    { href: '/family', label: 'Family' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <>
      <dialog
        ref={logoutModalRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box border border-base-content/10 bg-base-100/95 backdrop-blur-md">
          <h3 className="text-error text-lg font-bold">Confirm Logout</h3>
          <p className="py-4">
            Are you sure you want to log out from MetrixFolio?
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost btn-sm mr-2">Cancel</button>
            </form>
            <button className="btn btn-error btn-sm" onClick={handleLogoutConfirm}>
              Yes, Logout
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>Cancel</button>
        </form>
      </dialog>

      <div className="navbar bg-base-100/50 backdrop-blur-md sticky top-0 z-50 border-b border-base-content/5 px-4 md:px-6 shadow-sm transition-all duration-300">
        <div className="navbar-start">
          {/* Mobile Dropdown */}
          <div className="dropdown lg:hidden mr-1">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle btn-sm">
              <FiMenu className="h-5 w-5" />
            </div>
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content mt-3 z-[50] p-2 shadow-xl bg-base-100/95 backdrop-blur-md rounded-2xl w-56 border border-base-content/10 gap-1"
            >
              {links.map((link) => {
                const isActive = currentPathName === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={closeDropdown}
                      className={`px-4 py-2 rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-primary text-primary-content font-semibold'
                          : 'text-base-content/85 hover:bg-base-200'
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Logo with Gradient Container */}
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-all duration-200">
            <div className="w-8.5 h-8.5 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-indigo-500/10">
              <FiActivity className="text-white w-4.5 h-4.5" />
            </div>
            <span className="text-lg font-black tracking-tight bg-gradient-to-r from-base-content to-base-content/80 bg-clip-text text-transparent">
              MetrixFolio
            </span>
          </Link>
        </div>

        {/* Large Screen Menu */}
        <div className="navbar-center hidden lg:flex">
          <ul className="menu menu-horizontal gap-1.5 px-1">
            {links.map((link) => {
              const isActive = currentPathName === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`px-3 py-1.5 rounded-lg transition-all duration-200 text-sm ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold shadow-inner'
                        : 'text-base-content/75 hover:bg-base-200 hover:text-base-content'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="navbar-end gap-1.5">
          <label className="swap swap-rotate btn btn-ghost btn-circle btn-sm">
            <input
              type="checkbox"
              onChange={toggleTheme}
              checked={theme === 'dark'}
              className="hidden"
            />
            <FiSun className="swap-on h-4.5 w-4.5 fill-current" />
            <FiMoon className="swap-off h-4.5 w-4.5 fill-current" />
          </label>

          <button
            className="btn btn-outline btn-error btn-sm gap-1.5 rounded-lg transition-all duration-200"
            onClick={() => logoutModalRef.current?.showModal()}
          >
            <FiLogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

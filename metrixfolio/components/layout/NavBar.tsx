'use client';
import { useTheme } from '@/context/ThemeProvider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/utils/firebase';
import { FiMoon, FiSun, FiLogOut } from 'react-icons/fi';

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

  return (
    <>
      <dialog
        ref={logoutModalRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <h3 className="text-error text-lg font-bold">Confirm Logout</h3>
          <p className="py-4">
            Are you sure you want to log out from MetrixFolio?
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost mr-2">Cancel</button>
            </form>
            <button className="btn btn-error" onClick={handleLogoutConfirm}>
              Yes, Logout
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>Cancel</button>
        </form>
      </dialog>

      <div className="navbar bg-base-100 sticky top-0 z-50 shadow-sm">
        <div className="navbar-start">
          <Link href="/" className="btn btn-ghost text-xl normal-case">
            MetrixFolio
          </Link>
        </div>

        <div className="navbar-center hidden lg:flex">
          <ul className="menu menu-horizontal px-1">
            <li>
              <Link
                href={'/'}
                className={`${currentPathName === '/' ? 'menu-active' : ''}`}
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                href={'/positions'}
                className={`${currentPathName === '/positions' ? 'menu-active' : ''}`}
              >
                Positions
              </Link>
            </li>
            <li>
              <Link
                href={'/transactions'}
                className={`${currentPathName === '/transactions' ? 'menu-active' : ''}`}
              >
                Transactions
              </Link>
            </li>
            <li>
              <Link
                href={'/options'}
                className={`${currentPathName === '/options' ? 'menu-active' : ''}`}
              >
                Options
              </Link>
            </li>
            <li>
              <Link
                href={'/watchlist'}
                className={`${currentPathName === '/watchlist' ? 'menu-active' : ''}`}
              >
                Watchlist
              </Link>
            </li>
            <li>
              <Link
                href={'/debts'}
                className={`${currentPathName === '/debts' ? 'menu-active' : ''}`}
              >
                Debts
              </Link>
            </li>
            <li>
              <Link
                href={'/settings'}
                className={`${currentPathName === '/settings' ? 'menu-active' : ''}`}
              >
                Settings
              </Link>
            </li>
          </ul>
        </div>

        <div className="navbar-end">
          <label className="swap swap-rotate btn btn-ghost btn-circle">
            <input
              type="checkbox"
              onChange={toggleTheme}
              checked={theme === 'dark'}
              className="hidden"
            />

            <FiSun className="swap-on h-6 w-6 fill-current" />

            <FiMoon className="swap-off h-6 w-6 fill-current" />
          </label>

          <button
            className="btn btn-primary ml-2"
            onClick={() => logoutModalRef.current?.showModal()}
          >
            <FiLogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>
    </>
  );
};

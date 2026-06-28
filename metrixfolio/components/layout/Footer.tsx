import { version } from '../../package.json';

export const Footer = () => {
  return (
    <>
      <footer className="footer footer-center bg-base-200/50 backdrop-blur-md border-t border-base-content/5 text-base-content p-4 text-sm">
        <aside>
          <p>
            © {new Date().getFullYear()} -{' '}
            <a href="mailto:dogan.hurkan@gmail.com">by Hürkan Dogan</a> |
            Metrixfolio v{version}
          </p>
        </aside>
      </footer>
    </>
  );
};

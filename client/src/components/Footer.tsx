export default function Footer() {
  return (
    <footer className="bg-white">
      <div className="max-w-7xl mx-auto py-6 px-4 overflow-hidden sm:px-6 lg:px-8">
        <nav className="-mx-5 -my-2 flex flex-wrap justify-center" aria-label="Footer">
          <div className="px-5 py-2">
            <a href="#" className="text-base text-neutral-500 hover:text-neutral-900">
              About
            </a>
          </div>
          <div className="px-5 py-2">
            <a href="#" className="text-base text-neutral-500 hover:text-neutral-900">
              Support
            </a>
          </div>
          <div className="px-5 py-2">
            <a href="#" className="text-base text-neutral-500 hover:text-neutral-900">
              Contact
            </a>
          </div>
          <div className="px-5 py-2">
            <a href="#" className="text-base text-neutral-500 hover:text-neutral-900">
              Terms
            </a>
          </div>
          <div className="px-5 py-2">
            <a href="#" className="text-base text-neutral-500 hover:text-neutral-900">
              Privacy
            </a>
          </div>
        </nav>
        <p className="mt-8 text-center text-base text-neutral-400">
          &copy; {new Date().getFullYear()} TradeConnect. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

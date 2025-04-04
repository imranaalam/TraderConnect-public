import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";

export default function Header() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();

  return (
    <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zm-5-7v4h-4v-4h4zm0-6v4h-4V6h4zm-6 0v4H4V6h4zm0 6v4H4v-4h4zm12 0v4h-4v-4h4zm0-6v4h-4V6h4z" />
              </svg>
              <Link href="/">
                <span className="ml-2 text-xl font-semibold text-neutral-900 cursor-pointer">TradeConnect</span>
              </Link>
            </div>
            {user && (
              <nav className="hidden md:ml-6 md:flex md:space-x-8">
                <Link href="/">
                  <span className={`${location === "/" ? 'border-primary text-primary' : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'} border-b-2 px-1 pt-1 pb-3 text-sm font-medium cursor-pointer`}>
                    Accounts
                  </span>
                </Link>
                <Link href="/connect">
                  <span className={`${location === "/connect" ? 'border-primary text-primary' : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'} border-b-2 px-1 pt-1 pb-3 text-sm font-medium cursor-pointer`}>
                    Connect Exchange
                  </span>
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              {user ? (
                <Button
                  variant="outline"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  className="hidden md:inline-flex"
                >
                  {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
                </Button>
              ) : (
                <Link href="/auth">
                  <Button variant="default" className="hidden md:inline-flex">
                    Login
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

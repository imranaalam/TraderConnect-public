
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import WelcomeMessage from "@/components/WelcomeMessage";
import { Button } from "@/components/ui/button";
import ExchangesList from "@/components/ExchangesList";
import { useState } from "react";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [showAllExchanges, setShowAllExchanges] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h1 className="text-4xl font-bold tracking-tighter mb-4">
          Welcome to Trading Hub
        </h1>
        <p className="text-xl text-neutral-600 mb-8 max-w-[600px]">
          Connect and manage all your trading exchanges in one place
        </p>
        <Button asChild>
          <Link href="/auth">Get Started</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold">Your Trading Exchanges</h1>
        <div className="space-x-4">
          <Button 
            variant={showAllExchanges ? "outline" : "default"}
            onClick={() => setShowAllExchanges(false)}
          >
            Connected
          </Button>
          <Button 
            variant={showAllExchanges ? "default" : "outline"}
            onClick={() => setShowAllExchanges(true)}
          >
            All Exchanges
          </Button>
          <Button asChild>
            <Link href="/connect">Add New Exchange</Link>
          </Button>
        </div>
      </div>

      <ExchangesList showAllExchanges={showAllExchanges} />
    </div>
  );
}

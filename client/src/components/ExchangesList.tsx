
import { useQuery } from "@tanstack/react-query";
import { Exchange, Broker, Connection } from "@shared/schema";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Link } from "wouter";

export default function ExchangesList() {
  const { data: exchanges } = useQuery<Exchange[]>({
    queryKey: ["/api/exchanges"],
  });

  const { data: connections } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {exchanges?.map((exchange) => {
        const isConnected = connections?.some(c => c.exchangeId === exchange.id);
        
        return (
          <Card key={exchange.id} className="relative">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-medium">{exchange.name}</h3>
                  <p className="text-sm text-neutral-500 capitalize">{exchange.marketType}</p>
                </div>
                {isConnected ? (
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                    Connected
                  </span>
                ) : null}
              </div>

              {exchange.requiresBroker && (
                <div className="mt-2 text-sm text-neutral-600">
                  <p>Requires broker access</p>
                </div>
              )}

              <div className="mt-4">
                {!isConnected && (
                  <Button asChild className="w-full">
                    <Link href="/connect">Connect {exchange.name}</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

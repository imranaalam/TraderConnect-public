
import { useQuery } from "@tanstack/react-query";
import { Exchange, Broker, Connection } from "@shared/schema";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Link } from "wouter";
import { useEffect, useState } from "react";

export default function ExchangesList({ showAllExchanges = true }) {
  const { data: exchanges } = useQuery<Exchange[]>({
    queryKey: ["/api/exchanges"],
  });

  const { data: connections } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: brokers } = useQuery<Broker[]>({
    queryKey: ["/api/brokers"],
  });

  const [displayExchanges, setDisplayExchanges] = useState<Exchange[]>([]);

  useEffect(() => {
    if (exchanges && connections) {
      if (showAllExchanges) {
        setDisplayExchanges(exchanges);
      } else {
        // Only show connected exchanges
        const connectedExchangeIds = connections.map(c => c.exchangeId);
        const connectedExchanges = exchanges.filter(e => connectedExchangeIds.includes(e.id));
        setDisplayExchanges(connectedExchanges);
      }
    }
  }, [exchanges, connections, showAllExchanges]);

  const getBrokerName = (brokerId: number) => {
    const broker = brokers?.find(b => b.id === brokerId);
    return broker?.name || 'Direct Connection';
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {displayExchanges?.map((exchange) => {
          const connection = connections?.find(c => c.exchangeId === exchange.id);
          
          return (
            <Card key={exchange.id} className="relative">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-medium">{exchange.name}</h3>
                    <p className="text-sm text-neutral-500 capitalize">{exchange.marketType}</p>
                    {connection && (
                      <p className="text-sm text-neutral-600 mt-2">
                        Connected via {getBrokerName(connection.brokerId)}
                      </p>
                    )}
                  </div>
                  {connection ? (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                      Connected
                    </span>
                  ) : null}
                </div>

                {exchange.requiresBroker && !connection && (
                  <div className="mt-2 text-sm text-neutral-600">
                    <p>Requires broker access</p>
                  </div>
                )}

                <div className="mt-4">
                  {connection ? (
                    <Button asChild className="w-full">
                      <Link href={`/dashboard/${connection.id}`}>View Dashboard</Link>
                    </Button>
                  ) : (
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
    </div>
  );
}

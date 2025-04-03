import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import WelcomeMessage from "@/components/WelcomeMessage";
import { Button } from "@/components/ui/button";
import { PlusIcon, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Connection, Exchange, Broker } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { user } = useAuth();

  const { data: connections, isLoading: connectionsLoading } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });

  const { data: exchanges, isLoading: exchangesLoading } = useQuery<Exchange[]>({
    queryKey: ["/api/exchanges"],
  });

  if (connectionsLoading || exchangesLoading) {
    return (
      <div className="space-y-6">
        <WelcomeMessage />
        
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Your Connections</h2>
            <Skeleton className="h-9 w-40" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-4">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-28" />
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Find exchange details for each connection
  const getExchangeName = (exchangeId: number): string => {
    const exchange = exchanges?.find(e => e.id === exchangeId);
    return exchange?.name || "Unknown Exchange";
  };

  return (
    <div className="space-y-6">
      <WelcomeMessage />
      
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Your Connections</h2>
          <Link href="/connect">
            <Button className="flex items-center gap-2">
              <PlusIcon className="h-4 w-4" />
              Connect Exchange
            </Button>
          </Link>
        </div>
        
        {connections && connections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connections.map((connection) => (
              <Card key={connection.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{getExchangeName(connection.exchangeId)}</CardTitle>
                    <Badge variant={connection.isActive ? "default" : "secondary"}>
                      {connection.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <CardDescription>
                    {connection.brokerId ? "Via Broker" : "Direct Connection"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Account ID:</span>
                      <span className="font-medium">{connection.accountId || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Auth Method:</span>
                      <span className="font-medium capitalize">{connection.authMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Last Connected:</span>
                      <span className="font-medium">
                        {connection.lastConnected 
                          ? formatDistanceToNow(new Date(connection.lastConnected), { addSuffix: true })
                          : "Never"}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-4">
                  <Button variant="outline" size="sm">
                    Disconnect
                  </Button>
                  <Link href={`/dashboard/${connection.id}`}>
                    <Button size="sm" className="flex items-center gap-1">
                      View
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10">
              <div className="rounded-full bg-primary/10 p-3 mb-4">
                <PlusIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-medium mb-2">No Connections Yet</h3>
              <p className="text-neutral-500 mb-6 max-w-md">
                Connect to your preferred trading exchanges or brokers to start trading across multiple markets.
              </p>
              <Link href="/connect">
                <Button>Connect Your First Exchange</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

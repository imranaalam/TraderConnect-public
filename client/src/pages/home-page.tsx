
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  const [_, setLocation] = useLocation();

  const { data: connections, refetch } = useQuery({
    queryKey: ["/api/connections"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/connections");
      return res.json();
    },
  });

  const { data: exchanges } = useQuery({
    queryKey: ["/api/exchanges"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/exchanges");
      return res.json();
    },
  });

  // Refresh data when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetch]);

  return (
    <div className="mt-10 space-y-6">
      {connections && connections.length > 0 ? (
        connections.map((connection: any) => {
          const exchange = exchanges?.find(e => e.id === connection.exchangeId);
          
          return (
            <Card 
              key={connection.id} 
              className="cursor-pointer hover:bg-neutral-50 transition-colors"
              onClick={() => setLocation(`/dashboard/${connection.id}`)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl mb-2">
                      {exchange?.name || `Exchange ${connection.exchangeId}`}
                    </CardTitle>
                    <CardDescription>
                      <div className="space-y-1">
                        <div>Account: {connection.accountId || connection.credentials?.accountNumber || 'N/A'}</div>
                        <div>User ID: {connection.credentials?.username || 'N/A'}</div>
                        <div>Connection Type: {connection.authMethod === 'api' ? 'API' : 'Credentials'}</div>
                      </div>
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="mt-1">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Click to view detailed dashboard</p>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center">No connections found. Connect an exchange to get started.</p>
            <div className="mt-4 flex justify-center">
              <Link href="/connect">
                <Button>Connect Exchange</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

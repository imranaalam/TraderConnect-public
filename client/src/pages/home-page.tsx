import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

export default function HomePage() {
  const { data: connections } = useQuery({
    queryKey: ["/api/connections"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/connections");
      return res.json();
    },
  });

  return (
    <div className="mt-10 space-y-6">
      {connections && connections.length > 0 ? (
        connections.map((connection: any) => (
          <Link key={connection.id} href={`/dashboard/${connection.id}`}>
            <Card className="cursor-pointer hover:bg-neutral-50">
              <CardHeader>
                <CardTitle>Connection {connection.id}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>View Dashboard</p>
              </CardContent>
            </Card>
          </Link>
        ))
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
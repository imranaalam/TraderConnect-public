
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";
import { Connection, Exchange, Broker } from "@shared/schema";
import { Edit } from "lucide-react";

interface ConnectionCardProps {
  connection: Connection;
  exchange?: Exchange;
  broker?: Broker;
  onEditCredentials: () => void;
  onDisconnect: () => void;
  onBack: () => void;
  credentials: Record<string, string>;
  isDisconnecting: boolean;
}

export function ConnectionCard({
  connection,
  exchange,
  broker,
  onEditCredentials,
  onDisconnect,
  onBack,
  credentials,
  isDisconnecting
}: ConnectionCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-center">
        <div>
          <CardTitle className="text-xl">
            {exchange?.name || `Exchange ID ${connection.exchangeId}`}
          </CardTitle>
          <CardDescription>
            {broker ? `${broker.name} Connection` : "Direct Exchange Connection"}
            {connection.accountId ? ` (${connection.accountId})` : ""}
          </CardDescription>
        </div>
        <div className="flex items-center">
          <span className="h-3 w-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
          <span className="text-sm text-green-600 font-medium">Connected</span>
        </div>
      </CardHeader>

      <CardContent className="px-0 pt-0">
        <dl className="sm:divide-y sm:divide-neutral-200">
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Connection Type</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
              {connection.authMethod === "api" ? "API Connection" : "Credentials Connection"}
            </dd>
          </div>
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Account ID / Username</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 break-all">
              {connection.accountId || credentials.username || credentials.userId || credentials.apiKey || "Not specified"}
            </dd>
          </div>
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Exchange Type</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
              {exchange?.type || "N/A"}
            </dd>
          </div>
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Market Type</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
              {exchange?.marketType || "N/A"}
            </dd>
          </div>
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Broker</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
              {broker ? broker.name : "Direct Connection"}
            </dd>
          </div>
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Connection Status</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
              <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100 border-green-300">
                Active
              </Badge>
            </dd>
          </div>
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Last Connected</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
              {connection.lastConnected ? format(new Date(connection.lastConnected), "PPpp") : "Never"}
            </dd>
          </div>
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Credentials</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 flex items-center">
              <span className="mr-3">Stored securely</span>
              <Button size="sm" variant="outline" onClick={onEditCredentials}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Credentials
              </Button>
            </dd>
          </div>
        </dl>
      </CardContent>

      <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
        <Button variant="outline" onClick={onBack}>Go Back</Button>
        <Button 
          variant="destructive" 
          onClick={onDisconnect}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? "Disconnecting..." : "Disconnect"}
        </Button>
      </CardFooter>
    </Card>
  );
}

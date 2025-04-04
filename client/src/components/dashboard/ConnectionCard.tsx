
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Edit } from "lucide-react";
import type { Connection, Exchange, Broker } from "@shared/schema";

interface ConnectionCardProps {
  connection: Connection;
  exchange?: Exchange;
  broker?: Broker;
  onEditCredentials: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}

export function ConnectionCard({
  connection,
  exchange,
  broker,
  onEditCredentials,
  onDisconnect,
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
      {/* Connection Details */}
      <CardContent className="px-0 pt-0">
        <dl className="sm:divide-y sm:divide-neutral-200">
          {/* Fields */}
          <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-neutral-500">Connection Type</dt>
            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
              {connection.authMethod === "api" ? "API Connection" : "Credentials Connection"}
            </dd>
          </div>
          {/* Add other fields here... */}
        </dl>
      </CardContent>
      <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
        <Button variant="outline" onClick={() => setLocation("/")}>Go Back</Button>
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

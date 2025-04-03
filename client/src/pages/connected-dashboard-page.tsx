import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Connection, Exchange, Broker } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowRightIcon, Edit, Key, RefreshCw, Eye, EyeOff, Info, ListFilter, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table"; 
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ConnectedDashboardPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // Fetch connection details
  const { data: connection, isLoading: connectionLoading } = useQuery<Connection>({
    queryKey: ["/api/connections", id],
    queryFn: async () => {
      const res = await fetch(`/api/connections/${id}`);
      if (!res.ok) throw new Error("Failed to fetch connection");
      const data = await res.json();
      // Initialize the credentials state from the connection data
      if (data?.credentials) {
        setCredentials(data.credentials as Record<string, string>);
      }
      return data;
    }
  });

  // Fetch all exchanges
  const { data: exchanges, isLoading: exchangesLoading } = useQuery<Exchange[]>({
    queryKey: ["/api/exchanges"],
  });

  // Fetch brokers for the connection's exchange
  const { data: brokers, isLoading: brokersLoading } = useQuery<Broker[]>({
    queryKey: ["/api/brokers", connection?.exchangeId],
    enabled: !!connection?.exchangeId,
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/connections/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Disconnected",
        description: "Exchange connection has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Disconnection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update credentials mutation
  const updateCredentialsMutation = useMutation({
    mutationFn: async (updatedCredentials: Record<string, string>) => {
      const res = await apiRequest("PATCH", `/api/connections/${id}`, {
        credentials: updatedCredentials
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Credentials updated",
        description: "Your connection credentials have been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/connections", id] });
      setIsEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Fetch account details
  const { data: accountDetails, isLoading: accountDetailsLoading, refetch: refetchAccountDetails } = useQuery({
    queryKey: [`/api/account-details/${id}`],
    enabled: showAccountDetails,
    queryFn: async () => {
      setIsLoadingDetails(true);
      try {
        const res = await fetch(`/api/account-details/${id}`);
        if (!res.ok) throw new Error("Failed to fetch account details");
        return await res.json();
      } catch (error) {
        console.error("Error fetching account details:", error);
        toast({
          title: "Failed to load account details",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
        throw error;
      } finally {
        setIsLoadingDetails(false);
      }
    }
  });

  const isLoading = connectionLoading || exchangesLoading || brokersLoading;

  // Helper function to handle input changes
  const handleCredentialChange = (key: string, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle submit for credential updates
  const handleUpdateCredentials = () => {
    updateCredentialsMutation.mutate(credentials);
  };

  if (isLoading) {
    return (
      <div className="mt-10">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <div>
              <Skeleton className="h-7 w-48 mb-2" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="border-t border-neutral-200 px-4 py-5 sm:p-0">
            <dl className="sm:divide-y sm:divide-neutral-200">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-48 sm:col-span-2" />
                </div>
              ))}
            </dl>
          </div>
          <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="mt-10">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10">
            <h3 className="text-xl font-medium mb-2">Connection Not Found</h3>
            <p className="text-neutral-500 mb-6">
              The connection you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link href="/">
              <Button>Go Back Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Find exchange and broker details
  const exchange = exchanges?.find(e => e.id === connection.exchangeId);
  const broker = connection.brokerId ? brokers?.find(b => b.id === connection.brokerId) : undefined;

  // Determine which credential fields to show based on auth method and broker
  const getCredentialFields = () => {
    const fields = [];
    if (connection.authMethod === "api") {
      fields.push({ name: "apiKey", label: "API Key" });
      fields.push({ name: "apiSecret", label: "API Secret" });
    } else {
      if (broker?.name === "AKD") {
        fields.push({ name: "username", label: "Username" });
        fields.push({ name: "password", label: "Password" });
        fields.push({ name: "pin", label: "PIN Code" });
      } else if (broker?.name === "MKK") {
        fields.push({ name: "accountId", label: "Account ID" });
        fields.push({ name: "password", label: "Password" });
      } else if (broker?.name === "Zerodha") {
        fields.push({ name: "userId", label: "User ID" });
        fields.push({ name: "password", label: "Password" });
        fields.push({ name: "pin", label: "PIN" });
      } else {
        // Generic credential fields
        fields.push({ name: "username", label: "Username/ID" });
        fields.push({ name: "password", label: "Password" });
      }
    }
    return fields;
  };

  return (
    <div className="mt-10">
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-neutral-900">Connected Account</h3>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              {exchange?.name || "NaN"} Exchange
            </p>
          </div>
          <div className="flex items-center">
            <span className="h-3 w-3 bg-green-500 rounded-full mr-2"></span>
            <span className="text-sm text-green-500 font-medium">Connected</span>
          </div>
        </div>
        <div className="border-t border-neutral-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-neutral-200">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Connection Type</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                {connection.authMethod === "api" ? "API Connection" : "Credentials Connection"}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Account ID</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                {connection.accountId || 
                 (connection.credentials && (connection.credentials as any).username) || 
                 (connection.credentials && (connection.credentials as any).userId) || 
                 "Not specified"}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Exchange Type</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
                {exchange?.type || "N/A"}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Market Type</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
                {exchange?.marketType || "N/A"}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Broker</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                {broker ? broker.name : "Direct Connection"}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Connection Status</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
                  Active
                </Badge>
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Last Connected</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                {connection.lastConnected 
                  ? format(new Date(connection.lastConnected), "PPpp")
                  : "Never"}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Credentials</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 flex items-center">
                <span className="mr-3">••••••••••</span>
                <Button size="sm" variant="outline" onClick={() => setIsEditDialogOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Credentials
                </Button>
              </dd>
            </div>
          </dl>
        </div>
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
          <Button variant="outline" onClick={() => setLocation("/")}>
            Go Back
          </Button>
          <Button
            variant="destructive"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
          </Button>
        </div>
      </div>

      {/* Account Details Section */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Account Details</CardTitle>
                <CardDescription>
                  View detailed information about your trading account
                </CardDescription>
              </div>
              <Button 
                variant={showAccountDetails ? "default" : "outline"} 
                onClick={() => {
                  if (!showAccountDetails) {
                    setShowAccountDetails(true);
                  } else {
                    refetchAccountDetails();
                  }
                }}
                disabled={isLoadingDetails}
              >
                {isLoadingDetails ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : showAccountDetails ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          
          {showAccountDetails && (
            <CardContent>
              {isLoadingDetails ? (
                <div className="flex flex-col space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-6 w-64" />
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ))}
                </div>
              ) : accountDetails?.message ? (
                <Card className="border border-yellow-200 bg-yellow-50">
                  <CardContent className="pt-6">
                    <div className="flex items-center text-yellow-800">
                      <Info className="h-5 w-5 mr-2" />
                      <p>{accountDetails.message}</p>
                    </div>
                  </CardContent>
                </Card>
              ) : accountDetails ? (
                <Tabs defaultValue="portfolio" className="w-full mt-2">
                  <TabsList className="w-full justify-start border-b pb-0 mb-4">
                    <TabsTrigger value="portfolio" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Portfolio
                    </TabsTrigger>
                    <TabsTrigger value="orders" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                      <ListFilter className="h-4 w-4 mr-2" />
                      Orders
                    </TabsTrigger>
                    <TabsTrigger value="accounts" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                      <Key className="h-4 w-4 mr-2" />
                      Accounts
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="portfolio" className="mt-2">
                    <Accordion type="multiple" className="w-full">
                      {accountDetails.portfolioHoldings && (
                        <AccordionItem value="holdings">
                          <AccordionTrigger className="text-lg font-semibold">
                            Portfolio Holdings
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {accountDetails.portfolioHoldings.headers.map((header: string, i: number) => (
                                      <TableHead key={i} className="font-semibold">{header}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {accountDetails.portfolioHoldings.data.map((row: string[], i: number) => (
                                    <TableRow key={i}>
                                      {row.map((cell: string, j: number) => (
                                        <TableCell key={j}>{cell}</TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                      
                      {accountDetails.marginDetails && (
                        <AccordionItem value="margin">
                          <AccordionTrigger className="text-lg font-semibold">
                            Margin Details
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {accountDetails.marginDetails.headers.map((header: string, i: number) => (
                                      <TableHead key={i} className="font-semibold">{header}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {accountDetails.marginDetails.data.map((row: string[], i: number) => (
                                    <TableRow key={i}>
                                      {row.map((cell: string, j: number) => (
                                        <TableCell key={j}>{cell}</TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </TabsContent>
                  
                  <TabsContent value="orders" className="mt-2">
                    <Accordion type="multiple" className="w-full">
                      {accountDetails.orderHistory && (
                        <AccordionItem value="orders" defaultChecked>
                          <AccordionTrigger className="text-lg font-semibold">
                            Order History
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {accountDetails.orderHistory.headers.map((header: string, i: number) => (
                                      <TableHead key={i} className="font-semibold">{header}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {accountDetails.orderHistory.data.map((row: string[], i: number) => (
                                    <TableRow key={i}>
                                      {row.map((cell: string, j: number) => (
                                        <TableCell key={j}>{cell}</TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </TabsContent>
                  
                  <TabsContent value="accounts" className="mt-2">
                    <Accordion type="multiple" className="w-full">
                      {accountDetails.tradingAccounts && (
                        <AccordionItem value="accounts" defaultChecked>
                          <AccordionTrigger className="text-lg font-semibold">
                            Trading Accounts
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {accountDetails.tradingAccounts.headers.map((header: string, i: number) => (
                                      <TableHead key={i} className="font-semibold">{header}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {accountDetails.tradingAccounts.data.map((row: string[], i: number) => (
                                    <TableRow key={i}>
                                      {row.map((cell: string, j: number) => (
                                        <TableCell key={j}>{cell}</TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                      
                      {accountDetails.accountStatement && (
                        <AccordionItem value="statement">
                          <AccordionTrigger className="text-lg font-semibold">
                            Account Statement
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {accountDetails.accountStatement.headers.map((header: string, i: number) => (
                                      <TableHead key={i} className="font-semibold">{header}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {accountDetails.accountStatement.data.map((row: string[], i: number) => (
                                    <TableRow key={i}>
                                      {row.map((cell: string, j: number) => (
                                        <TableCell key={j}>{cell}</TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="text-center py-10">
                  <p className="text-neutral-500">Select "View Details" to fetch account information</p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Edit Credentials Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Connection Credentials</DialogTitle>
            <DialogDescription>
              Update your connection credentials for {exchange?.name}
              {broker ? ` via ${broker.name}` : ""}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {getCredentialFields().map((field) => (
              <div className="grid grid-cols-4 items-center gap-4" key={field.name}>
                <Label htmlFor={field.name} className="text-right">
                  {field.label}
                </Label>
                <Input
                  id={field.name}
                  type={field.name.includes("password") || field.name.includes("secret") || field.name.includes("pin") ? "password" : "text"}
                  className="col-span-3"
                  value={(credentials as any)[field.name] || ""}
                  onChange={(e) => handleCredentialChange(field.name, e.target.value)}
                />
              </div>
            ))}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateCredentials}
              disabled={updateCredentialsMutation.isPending}
            >
              {updateCredentialsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

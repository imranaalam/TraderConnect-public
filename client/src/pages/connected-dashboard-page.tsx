// ConnectedDashboardPage.tsx
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
// Assuming these types exist or defining basic ones if not
// import { Connection, Exchange, Broker } from "@shared/schema";
interface Connection {
  id: string | number;
  exchangeId: string | number;
  brokerId?: string | number | null;
  authMethod: "api" | "credentials";
  accountId?: string | null;
  credentials?: Record<string, any> | null;
  lastConnected?: string | null;
}
interface Exchange {
  id: string | number;
  name: string;
  type: string;
  marketType: string;
}
interface Broker {
  id: string | number;
  name: string;
}
// End Basic Type Definitions

import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowRightIcon,
  Edit,
  Key,
  RefreshCw,
  Eye,
  EyeOff,
  Info,
  ListFilter,
  BarChart3,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Define structure expected from backend API based on akdApiClient.ts return
interface FetchResultData {
  headers: string[];
  data: string[][];
}
interface AccountDetailsResponse {
  tradingAccounts: FetchResultData;
  orderHistory: FetchResultData;
  positions: FetchResultData; // Changed from portfolioHoldings
  accountInfo: FetchResultData; // Changed from multiple sections
  accountStatement: FetchResultData; // <-- ADDED
  timestamp: string;
  dataSource: string;
  message?: string; // Optional message field
}

export default function ConnectedDashboardPage() {
  const { id } = useParams<{ id: string }>(); // Ensure id is treated as string
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false); // Renamed for clarity

  // Fetch connection details
  const {
    data: connection,
    isLoading: connectionLoading,
    error: connectionError,
  } = useQuery<Connection>({
    queryKey: ["/api/connections", id],
    queryFn: async () => {
      console.log(`Fetching connection details for ID: ${id}`);
      const res = await apiRequest("GET", `/api/connections/${id}`);
      const data = await res.json();
      console.log("Connection data received:", data);
      if (data?.credentials && typeof data.credentials === "object") {
        // Ensure credentials are treated as string key/value pairs
        const stringCredentials: Record<string, string> = {};
        for (const key in data.credentials) {
          if (Object.prototype.hasOwnProperty.call(data.credentials, key)) {
            stringCredentials[key] = String(data.credentials[key] ?? ""); // Convert values to string safely
          }
        }
        setCredentials(stringCredentials);
      }
      return data;
    },
    retry: false, // Don't retry if connection fetch fails
  });

  // Fetch all exchanges
  const { data: exchanges, isLoading: exchangesLoading } = useQuery<Exchange[]>(
    {
      queryKey: ["/api/exchanges"],
      queryFn: async () => {
        console.log("Fetching all exchanges");
        const res = await apiRequest("GET", "/api/exchanges");
        const data = await res.json();
        console.log("Exchanges received:", data);
        return data;
      },
    },
  );

  // Fetch brokers for the connection's exchange
  const { data: brokers, isLoading: brokersLoading } = useQuery<Broker[]>({
    queryKey: ["/api/brokers", connection?.exchangeId],
    enabled: !!connection?.exchangeId, // Only run if connection and exchangeId are loaded
    queryFn: async ({ queryKey }) => {
      const [, exchangeId] = queryKey as [string, string | number]; // Type the queryKey
      console.log(`Fetching brokers for exchange ID: ${exchangeId}`);
      const res = await apiRequest("GET", `/api/brokers/${exchangeId}`);
      const data = await res.json();
      console.log("Brokers received:", data);
      return data;
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      console.log(`Disconnecting connection ID: ${id}`);
      await apiRequest("DELETE", `/api/connections/${id}`);
    },
    onSuccess: () => {
      console.log("Disconnection successful");
      toast({
        title: "Disconnected",
        description: "Exchange connection has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] }); // Invalidate list
      setLocation("/"); // Redirect to home/dashboard
    },
    onError: (error: Error) => {
      console.error("Disconnection failed:", error);
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
      console.log(
        `Updating credentials for connection ID: ${id}`,
        updatedCredentials,
      );
      const res = await apiRequest("PATCH", `/api/connections/${id}`, {
        credentials: updatedCredentials,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      console.log("Credentials update successful:", data);
      toast({
        title: "Credentials updated",
        description:
          "Your connection credentials have been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/connections", id] }); // Refetch this connection's details
      setIsEditDialogOpen(false); // Close dialog
    },
    onError: (error: Error) => {
      console.error("Credentials update failed:", error);
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch account details - Type the query data
  const {
    data: accountDetails,
    error: accountDetailsError,
    refetch: refetchAccountDetails,
  } = useQuery<AccountDetailsResponse, Error>({
    // Explicitly type Error
    queryKey: [`/api/account-details/${id}`],
    enabled: showAccountDetails, // Only fetch when showAccountDetails is true
    queryFn: async () => {
      setIsLoadingDetails(true);
      try {
        console.log(`Fetching account details for connection ID: ${id}`);
        const res = await apiRequest("GET", `/api/account-details/${id}`);
        const data = await res.json();
        console.log("Received account details data structure:", data); // Log received data structure

        // Validate core structure
        if (!data || typeof data !== "object" || !data.dataSource) {
          console.error(
            "Invalid data format received from account details API:",
            data,
          );
          throw new Error("Invalid data format received from API.");
        }

        // Check for specific error source markers from backend
        if (
          data.dataSource === "error" ||
          data.dataSource === "error_auth" ||
          data.dataSource === "partial_error"
        ) {
          const errorMessage =
            data.tradingAccounts?.data?.[0]?.[0] || // Try to get error from tradingAccounts
            data.message || // Check if there's a top-level message
            "Failed to fetch details";
          console.warn(
            `Account details fetch failed (dataSource: ${data.dataSource}). Error: ${errorMessage}`,
          );
          toast({
            title: "Failed to load account details",
            description: errorMessage,
            variant: "destructive",
          });
          // Return the structure even on error so UI can react
          return data as AccountDetailsResponse;
        }

        // Validate presence and basic structure of expected data sections
        const sections = [
          "tradingAccounts",
          "orderHistory",
          "positions",
          "accountInfo",
        ];
        for (const section of sections) {
          if (
            !data[section] ||
            !Array.isArray(data[section].headers) ||
            !Array.isArray(data[section].data)
          ) {
            console.warn(
              `Account details validation warning: Section "${section}" has invalid structure.`,
              data[section],
            );
            // Optionally normalize the structure here if needed, e.g., ensure headers/data are empty arrays
            if (!data[section]) data[section] = { headers: [], data: [] };
            if (!Array.isArray(data[section].headers))
              data[section].headers = [];
            if (!Array.isArray(data[section].data)) data[section].data = [];
          }
        }

        return data as AccountDetailsResponse;
      } catch (error) {
        console.error("Error during account details fetch queryFn:", error);
        const message =
          error instanceof Error ? error.message : "Unknown fetch error";
        toast({
          title: "Failed to load account details",
          description: message,
          variant: "destructive",
        });
        throw new Error(message); // Re-throw for react-query's error state
      } finally {
        setIsLoadingDetails(false);
        console.log("Finished account details fetch attempt.");
      }
    },
    retry: 1, // Retry once on failure
    refetchOnWindowFocus: false, // Avoid refetching just on window focus
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  const isLoading = connectionLoading || exchangesLoading || brokersLoading;

  const handleCredentialChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpdateCredentials = () => {
    console.log("Submitting credential update:", credentials);
    updateCredentialsMutation.mutate(credentials);
  };

  // Handle specific connection fetch error
  if (connectionError) {
    return (
      <div className="mt-10">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10">
            <Info className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">
              Error Loading Connection
            </h3>
            <p className="text-neutral-500 mb-6">
              Could not load the connection details. Please try again later or
              check the connection ID.
              <br />
              <span className="text-xs text-red-600">
                {connectionError.message}
              </span>
            </p>
            <Link href="/">
              <Button variant="outline">Go Back Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      // --- Skeleton Loading State ---
      <div className="mt-10 space-y-6">
        {/* Connection Card Skeleton */}
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <Skeleton className="h-7 w-48 mb-2" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent className="px-4 py-5 sm:p-0">
            <dl className="sm:divide-y sm:divide-neutral-200">
              {[...Array(6)].map(
                (
                  _,
                  i, // More skeleton rows
                ) => (
                  <div
                    key={i}
                    className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"
                  >
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-48 sm:col-span-2" />
                  </div>
                ),
              )}
            </dl>
          </CardContent>
          <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </CardFooter>
        </Card>
        {/* Account Details Card Skeleton */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <Skeleton className="h-7 w-40 mb-2" />
                <Skeleton className="h-5 w-64" />
              </div>
              <Skeleton className="h-10 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full mb-4" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!connection) {
    // Handle case where connection is successfully fetched but is null/undefined
    return (
      <div className="mt-10">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10">
            <Info className="h-12 w-12 text-yellow-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">Connection Not Found</h3>
            <p className="text-neutral-500 mb-6">
              The connection with ID '{id}' could not be found.
            </p>
            <Link href="/">
              <Button variant="outline">Go Back Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Find exchange and broker details safely
  const exchange = exchanges?.find(
    (e) => String(e.id) === String(connection.exchangeId),
  );
  const broker = connection.brokerId
    ? brokers?.find((b) => String(b.id) === String(connection.brokerId))
    : undefined;

  const getCredentialFields = () => {
    const fields = [];
    // Simplified logic, adjust based on actual broker names/auth methods
    if (connection.authMethod === "api") {
      fields.push({ name: "apiKey", label: "API Key" });
      fields.push({ name: "apiSecret", label: "API Secret" });
    } else if (broker?.name === "AKD") {
      // Use exact broker name
      fields.push({ name: "username", label: "Username" });
      fields.push({ name: "password", label: "Password" });
      fields.push({ name: "pin", label: "PIN Code" }); // Assuming AKD needs PIN
    } else {
      // Generic fallback
      fields.push({ name: "username", label: "Username/ID" });
      fields.push({ name: "password", label: "Password" });
    }
    // Add any fields present in current credentials state but not in default list
    Object.keys(credentials).forEach((key) => {
      if (!fields.some((f) => f.name === key)) {
        fields.push({
          name: key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
        }); // Auto-label
      }
    });
    return fields;
  };

  // Determine if details fetch failed specifically due to auth or other errors
  const authFetchFailed = accountDetails?.dataSource === "error_auth";
  const detailsFetchError =
    accountDetailsError || accountDetails?.dataSource === "error"; // General API or fetch error
  const hasDetailsData =
    accountDetails && !authFetchFailed && !detailsFetchError;

  // Determine which tabs have data to display
  const hasPositionsData =
    hasDetailsData && accountDetails.positions?.data?.length > 0;
  const hasOrderHistoryData =
    hasDetailsData && accountDetails.orderHistory?.data?.length > 0;
  const hasTradingAccountsData =
    hasDetailsData && accountDetails.tradingAccounts?.data?.length > 0;
  // --- ADD Check for Account Statement ---
  const hasAccountStatementData =
    hasDetailsData && accountDetails.accountStatement?.data?.length > 0;
  // --- END ADD ---
  const hasAccountInfoData =
    hasDetailsData && accountDetails.accountInfo?.data?.length > 0;
  const anyDetailsDataAvailable =
    hasPositionsData ||
    hasOrderHistoryData ||
    hasTradingAccountsData ||
    hasAccountStatementData || // <-- ADDED
    hasAccountInfoData;

  // Determine default tab based on available data
  const defaultTabValue = hasPositionsData
    ? "portfolio"
    : hasOrderHistoryData
      ? "orders"
      : hasTradingAccountsData
        ? "accounts"
        : hasAccountInfoData
          ? "info"
          : "portfolio"; // Fallback default

  return (
    <div className="mt-10 space-y-6">
      {/* Connection Details Card */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <div>
            <CardTitle className="text-xl">
              {exchange?.name || `Exchange ID ${connection.exchangeId}`}
            </CardTitle>
            <CardDescription>
              hasTradingAccountsData
              {broker
                ? `${broker.name} Connection`
                : "Direct Exchange Connection"}
            </CardDescription>
          </div>
          <div className="flex items-center">
            <span
              className={`h-3 w-3 ${connection ? "bg-green-500" : "bg-red-500"} rounded-full mr-2`}
            ></span>
            <span
              className={`text-sm ${connection ? "text-green-600" : "text-red-600"} font-medium`}
            >
              {connection ? "Connected" : "Error"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <dl className="sm:divide-y sm:divide-neutral-200">
            {/* Connection Type */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">
                Connection Type
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                {connection.authMethod === "api"
                  ? "API Connection"
                  : "Credentials Connection"}
              </dd>
            </div>
            {/* Account ID */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">
                Account ID / Username
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 break-all">
                {connection.accountId ||
                  credentials.username || // Display username from state if available
                  credentials.userId ||
                  credentials.apiKey || // Display apiKey for API connections
                  "Not specified"}
              </dd>
            </div>
            {/* Exchange Type */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">
                Exchange Type
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
                {exchange?.type || "N/A"}
              </dd>
            </div>
            {/* Market Type */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">
                Market Type
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
                {exchange?.marketType || "N/A"}
              </dd>
            </div>
            {/* Broker */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">Broker</dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                {broker ? broker.name : "Direct Connection"}
              </dd>
            </div>
            {/* Status */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">
                Connection Status
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-800 hover:bg-green-100 border-green-300"
                >
                  Active
                </Badge>
              </dd>
            </div>
            {/* Last Connected */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">
                Last Connected
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                {connection.lastConnected
                  ? format(new Date(connection.lastConnected), "PPpp")
                  : "Never"}
              </dd>
            </div>
            {/* Credentials Edit */}
            <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-neutral-500">
                Credentials
              </dt>
              <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 flex items-center">
                <span className="mr-3">Stored securely</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(true)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Credentials
                </Button>
              </dd>
            </div>
          </dl>
        </CardContent>
        <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
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
        </CardFooter>
      </Card>

      {/* Account Details Section */}
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
                  console.log(
                    "Setting showAccountDetails to true, triggering query...",
                  );
                  setShowAccountDetails(true);
                } else {
                  console.log("Refreshing account details...");
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
            {isLoadingDetails ? ( // Show skeleton while loading details
              <div className="flex flex-col space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ))}
              </div>
            ) : authFetchFailed ? ( // Show specific auth error message
              <Card className="border border-red-200 bg-red-50">
                <CardContent className="pt-6">
                  <div className="flex items-center text-red-800">
                    <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                    <p>
                      Authentication failed. Cannot retrieve account details.
                      Please verify your credentials.
                      {accountDetails?.tradingAccounts?.data?.[0]?.[0] &&
                        ` (Error: ${accountDetails.tradingAccounts.data[0][0]})`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : detailsFetchError ? ( // Show general fetch error message
              <Card className="border border-yellow-200 bg-yellow-50">
                <CardContent className="pt-6">
                  <div className="flex items-center text-yellow-800">
                    <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                    <p>
                      Failed to load account details.{" "}
                      {accountDetailsError?.message || "Please try refreshing."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : anyDetailsDataAvailable ? ( // Render Tabs if *any* data section is available
              <Tabs defaultValue={defaultTabValue} className="w-full mt-2">
                <TabsList className="w-full justify-start border-b pb-0 mb-4 overflow-x-auto">
                  {hasPositionsData && (
                    <TabsTrigger value="portfolio">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Portfolio
                    </TabsTrigger>
                  )}
                  {hasOrderHistoryData && (
                    <TabsTrigger value="orders">
                      <ListFilter className="h-4 w-4 mr-2" />
                      Orders
                    </TabsTrigger>
                  )}
                  {(hasTradingAccountsData || hasAccountStatementData) && (
                    <TabsTrigger value="accounts">
                      <Key className="h-4 w-4 mr-2" />
                      Accounts
                    </TabsTrigger>
                  )}
                  {hasAccountInfoData && (
                    <TabsTrigger value="info">
                      <Info className="h-4 w-4 mr-2" />
                      Info
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Portfolio Tab */}
                {hasPositionsData && (
                  <TabsContent value="portfolio" className="mt-2">
                    <Accordion
                      type="single"
                      collapsible
                      className="w-full"
                      defaultValue="positions"
                    >
                      <AccordionItem value="positions">
                        <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                          Portfolio Positions
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {accountDetails.positions.headers.map(
                                    (h, i) => (
                                      <TableHead key={i}>{h}</TableHead>
                                    ),
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {accountDetails.positions.data.map((row, i) => (
                                  <TableRow key={i}>
                                    {row.map((cell, j) => (
                                      <TableCell key={j}>
                                        {cell || "-"}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TabsContent>
                )}

                {/* Orders Tab */}
                {hasOrderHistoryData && (
                  <TabsContent value="orders" className="mt-2">
                    <Accordion
                      type="single"
                      collapsible
                      className="w-full"
                      defaultValue="order-history"
                    >
                      <AccordionItem value="order-history">
                        <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                          Order History
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {accountDetails.orderHistory.headers.map(
                                    (h, i) => (
                                      <TableHead key={i}>{h}</TableHead>
                                    ),
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {accountDetails.orderHistory.data.map(
                                  (row, i) => (
                                    <TableRow key={i}>
                                      {row.map((cell, j) => (
                                        <TableCell key={j}>
                                          {cell || "-"}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ),
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TabsContent>
                )}

                {/* Accounts Tab */}
                {hasTradingAccountsData && (
                  <TabsContent value="accounts" className="mt-2">
                    <Accordion
                      type="single"
                      collapsible
                      className="w-full"
                      defaultValue="trading-accounts"
                    >
                      <AccordionItem value="trading-accounts">
                        <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                          Trading Accounts
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {accountDetails.tradingAccounts.headers.map(
                                    (h, i) => (
                                      <TableHead key={i}>{h}</TableHead>
                                    ),
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {accountDetails.tradingAccounts.data.map(
                                  (row, i) => (
                                    <TableRow key={i}>
                                      {row.map((cell, j) => (
                                        <TableCell key={j}>
                                          {cell || "-"}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ),
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      {/* --- ADD Account Statement Accordion --- */}
                      {hasAccountStatementData && (
                        <AccordionItem value="account-statement">
                          <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                            Account Statement
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto max-h-[500px]">
                              {" "}
                              {/* Added max height and scroll */}
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {accountDetails.accountStatement.headers.map(
                                      (h, i) => (
                                        <TableHead
                                          key={i}
                                          className="sticky top-0 bg-background z-10"
                                        >
                                          {h}
                                        </TableHead>
                                      ), // Sticky header
                                    )}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {accountDetails.accountStatement.data.map(
                                    (row, i) => (
                                      <TableRow key={i}>
                                        {row.map((cell, j) => (
                                          <TableCell
                                            key={j}
                                            className="text-xs"
                                          >
                                            {" "}
                                            {/* Smaller text for statement */}
                                            {cell || "-"}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ),
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                      {/* --- END ADD --- */}
                    </Accordion>
                  </TabsContent>
                )}

                {/* --- End Modify Accounts Tab Content --- */}

                {/* Info Tab */}
                {hasAccountInfoData && (
                  <TabsContent value="info" className="mt-2">
                    <Accordion
                      type="single"
                      collapsible
                      className="w-full"
                      defaultValue="account-info"
                    >
                      <AccordionItem value="account-info">
                        <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                          Account Information
                        </AccordionTrigger>
                        <AccordionContent>
                          <dl className="space-y-3">
                            {" "}
                            {/* Increased spacing */}
                            {accountDetails.accountInfo.data.map(
                              (row: string[], i: number) => (
                                <div
                                  key={i}
                                  className="grid grid-cols-3 gap-4 border-b border-dashed pb-2 last:border-b-0 last:pb-0"
                                >
                                  <dt className="text-sm font-medium text-neutral-500 col-span-1 truncate">
                                    {row[0] || "N/A"}
                                  </dt>
                                  <dd className="text-sm text-neutral-900 col-span-2 break-words">
                                    {row[1] || "-"}
                                  </dd>
                                </div>
                              ),
                            )}
                          </dl>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TabsContent>
                )}
              </Tabs>
            ) : (
              // If showAccountDetails is true but no sections have data and no errors
              <div className="text-center py-10">
                <p className="text-neutral-500">
                  No detailed account information available for this connection.
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Edit Credentials Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Connection Credentials</DialogTitle>
            <DialogDescription>
              Update credentials for {exchange?.name}{" "}
              {broker ? `(${broker.name})` : ""}. Changes will take effect on
              the next data refresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {getCredentialFields().map((field) => (
              <div
                className="grid grid-cols-4 items-center gap-4"
                key={field.name}
              >
                <Label htmlFor={field.name} className="text-right">
                  {field.label}
                </Label>
                <Input
                  id={field.name}
                  type={
                    /password|secret|pin/i.test(field.name)
                      ? "password"
                      : "text"
                  }
                  className="col-span-3"
                  value={credentials[field.name] || ""}
                  onChange={(e) =>
                    handleCredentialChange(field.name, e.target.value)
                  }
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
              {updateCredentialsMutation.isPending
                ? "Saving..."
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
    Edit,
    Key,
    RefreshCw,
    Eye,
    // EyeOff, // Not used
    Info, // Keep for general info icons/error states
    ListFilter,
    BarChart3,
    ClipboardList, // New icon for Logs card
    BookOpen, // Icon for Trade Log
    Activity, // Icon for Daily Activity Log
    AlertTriangle, // Icon for Outstanding Log or Errors
    FileText, // Icon for Account Statement
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useState, useMemo } from "react"; // Added useMemo
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

// Import types from the backend client (adjust path if needed)
// Assuming akdApiClient.ts is in the same directory or accessible via alias
import type {
    AccountDetailsResponse,
    AccountLogsResponse, // Import the new log response type
    FetchResult as FetchResultType,
} from "./akdApiClient"; // Make sure path is correct

// --- Helper Component for Rendering Tables ---
interface DataTableProps {
    title: string;
    fetchResult?: FetchResultType; // Use imported type
    isLoading?: boolean;
    // Pass the specific error message for this section if available
    error?: string | null;
    maxHeight?: string;
    defaultOpen?: boolean;
}

const DataTableAccordion: React.FC<DataTableProps> = ({
    title,
    fetchResult,
    isLoading,
    error, // Use the explicit error prop passed down
    maxHeight = "500px", // Default max height
    defaultOpen = false,
}) => {
    const hasData =
        fetchResult &&
        fetchResult.data &&
        fetchResult.data.length > 0 &&
        !fetchResult.isErrorState;
    const hasHeaders =
        fetchResult && fetchResult.headers && fetchResult.headers.length > 0;
    const accordionValue = title.toLowerCase().replace(/\s+/g, "-");

    // Use the passed 'error' prop directly, or the fetchResult's error message
    const displayError = error || fetchResult?.errorMessage;
    const isError = !!displayError; // True if either error prop or internal error exists

    if (isLoading) {
        return (
            <Accordion
                type="single"
                collapsible
                className="w-full"
                defaultValue={accordionValue}
            >
                <AccordionItem value={accordionValue} className="border-b">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                        {title}
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="space-y-2 p-4">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    // Display explicit error first if provided
    if (isError) {
        return (
            <Accordion
                type="single"
                collapsible
                className="w-full"
                defaultValue={accordionValue} // Keep open if error
            >
                <AccordionItem
                    value={accordionValue}
                    className="border-b border-red-200 bg-red-50/50" // Error styling
                >
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline text-red-700">
                        <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />{" "}
                        {title} - Error
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="p-4 text-red-600 rounded">
                            <p>{displayError}</p>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    // If no explicit error, check if data is missing or empty
    if (!hasData || !hasHeaders) {
        return (
            <Accordion
                type="single"
                collapsible
                className="w-full"
                defaultValue={defaultOpen ? accordionValue : undefined}
            >
                <AccordionItem value={accordionValue} className="border-b">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                        {title}
                    </AccordionTrigger>
                    <AccordionContent>
                        <p className="p-4 text-neutral-500">
                            No data available.
                        </p>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    // Render the table if data exists
    return (
        <Accordion
            type="single"
            collapsible
            className="w-full"
            defaultValue={defaultOpen ? accordionValue : undefined}
        >
            <AccordionItem value={accordionValue} className="border-b">
                <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                    {title}
                </AccordionTrigger>
                <AccordionContent>
                    <div
                        className="overflow-x-auto relative" // Added relative positioning
                        style={{ maxHeight: maxHeight }}
                    >
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    {fetchResult.headers.map((h, i) => (
                                        <TableHead
                                            key={`${title}-header-${i}`} // More specific key
                                            className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm" // Adjust padding/size
                                        >
                                            {h || `Col_${i + 1}`}{" "}
                                            {/* Fallback for empty header */}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fetchResult.data.map((row, i) => (
                                    <TableRow
                                        key={`${title}-row-${i}`} // More specific key
                                        className={
                                            i % 2 === 0
                                                ? "bg-muted/30 hover:bg-muted/60"
                                                : "hover:bg-muted/60"
                                        } // Subtle hover
                                    >
                                        {/* Ensure row length matches header length for rendering */}
                                        {Array.from({
                                            length: fetchResult.headers.length,
                                        }).map((_, j) => (
                                            <TableCell
                                                key={`${title}-cell-${i}-${j}`} // More specific key
                                                className="text-xs whitespace-nowrap px-3 py-1.5" // Adjust padding/size
                                            >
                                                {/* Render '-' for null/undefined/empty string */}
                                                {row[j] === null ||
                                                row[j] === undefined ||
                                                row[j] === ""
                                                    ? "-"
                                                    : row[j]}
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
    );
};
// --- End Helper Component ---

export default function ConnectedDashboardPage() {
    const { id } = useParams<{ id: string }>();
    const { toast } = useToast();
    const [_, setLocation] = useLocation();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [credentials, setCredentials] = useState<Record<string, string>>({});
    // const [showAccountDetails, setShowAccountDetails] = useState(true); // Keep details open by default - Not needed, fetched automatically

    // State for Logs visibility
    const [showLogs, setShowLogs] = useState(false); // Logs closed by default

    // Fetch connection details
    const {
        data: connection,
        isLoading: connectionLoading,
        error: connectionError,
    } = useQuery<Connection>({
        queryKey: ["/api/connections", id],
        queryFn: async () => {
            // console.log(`Fetching connection details for ID: ${id}`);
            const res = await apiRequest("GET", `/api/connections/${id}`);
            if (!res.ok) {
                const errorData = await res
                    .json()
                    .catch(() => ({
                        message: "Failed to parse error response",
                    }));
                throw new Error(
                    errorData.message || `HTTP error! status: ${res.status}`,
                );
            }
            const data = await res.json();
            // console.log("Connection data received:", data);
            if (data?.credentials && typeof data.credentials === "object") {
                const stringCredentials: Record<string, string> = {};
                for (const key in data.credentials) {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            data.credentials,
                            key,
                        )
                    ) {
                        stringCredentials[key] = String(
                            data.credentials[key] ?? "",
                        );
                    }
                }
                setCredentials(stringCredentials);
            }
            return data;
        },
        retry: 1,
    });

    // Fetch all exchanges
    const { data: exchanges, isLoading: exchangesLoading } = useQuery<
        Exchange[]
    >({
        queryKey: ["/api/exchanges"],
        queryFn: async () => {
            // console.log("Fetching all exchanges");
            const res = await apiRequest("GET", "/api/exchanges");
            if (!res.ok) throw new Error("Failed to fetch exchanges");
            const data = await res.json();
            // console.log("Exchanges received:", data);
            return data;
        },
    });

    // Fetch brokers for the connection's exchange
    const { data: brokers, isLoading: brokersLoading } = useQuery<Broker[]>({
        queryKey: ["/api/brokers", connection?.exchangeId],
        enabled: !!connection?.exchangeId,
        queryFn: async ({ queryKey }) => {
            const [, exchangeId] = queryKey as [string, string | number];
            // console.log(`Fetching brokers for exchange ID: ${exchangeId}`);
            const res = await apiRequest("GET", `/api/brokers/${exchangeId}`);
            if (!res.ok) throw new Error("Failed to fetch brokers");
            const data = await res.json();
            // console.log("Brokers received:", data);
            return data;
        },
    });

    // Disconnect mutation
    const disconnectMutation = useMutation({
        mutationFn: async () => {
            // console.log(`Disconnecting connection ID: ${id}`);
            await apiRequest("DELETE", `/api/connections/${id}`);
        },
        onSuccess: () => {
            // console.log("Disconnection successful");
            toast({
                title: "Disconnected",
                description: "Exchange connection has been removed",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
            setLocation("/");
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
            // console.log(`Updating credentials for connection ID: ${id}`, "***"); // Mask creds in log
            const res = await apiRequest("PATCH", `/api/connections/${id}`, {
                credentials: updatedCredentials,
            });
            if (!res.ok) {
                const errorData = await res
                    .json()
                    .catch(() => ({
                        message: "Failed to parse error response",
                    }));
                throw new Error(
                    errorData.message || `HTTP error! status: ${res.status}`,
                );
            }
            return await res.json();
        },
        onSuccess: (data) => {
            // console.log("Credentials update successful:", data);
            toast({
                title: "Credentials updated",
                description:
                    "Your connection credentials have been updated successfully",
            });
            queryClient.invalidateQueries({
                queryKey: ["/api/connections", id],
            });
            // Trigger refetch of details/logs after credential update
            console.log(
                "Credentials updated, refetching details and logs (if shown)...",
            );
            refetchAccountDetails();
            if (showLogs) {
                refetchAccountLogs();
            }
            setIsEditDialogOpen(false);
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

    // Fetch account details - Use the imported type
    const {
        data: accountDetails,
        error: accountDetailsError, // This is the query-level error
        refetch: refetchAccountDetails,
        isFetching: isFetchingAccountDetails,
        isLoading: isInitialLoadingAccountDetails, // Use isLoading for initial load state
    } = useQuery<AccountDetailsResponse, Error>({
        queryKey: [`/api/account-details/${id}`],
        // enabled: true, // Fetch automatically on mount/refresh
        queryFn: async () => {
            try {
                // console.log(`Fetching account details for connection ID: ${id}`);
                const res = await apiRequest(
                    "GET",
                    `/api/account-details/${id}`,
                ); // Assumes backend endpoint exists
                if (!res.ok) {
                    const errorData = await res
                        .json()
                        .catch(() => ({
                            message: "Failed to parse error response",
                        }));
                    throw new Error(
                        errorData.message ||
                            `HTTP error! status: ${res.status}`,
                    );
                }
                const data: AccountDetailsResponse = await res.json();
                // console.log("Received account details data structure:", data);

                if (!data || typeof data !== "object" || !data.dataSource) {
                    console.error(
                        "Invalid data format received from account details API:",
                        data,
                    );
                    throw new Error(
                        "Invalid data format received from details API.",
                    );
                }

                // Log based on dataSource status from backend
                if (
                    data.dataSource === "error" ||
                    data.dataSource === "error_auth" ||
                    data.dataSource === "partial_error"
                ) {
                    const errorMessage =
                        data.message || "Failed to fetch details completely";
                    console.warn(
                        `Account details fetch issues (dataSource: ${data.dataSource}). Message: ${errorMessage}`,
                    );
                    // Don't throw here, let the UI handle displaying the status based on dataSource
                }

                // Basic validation (optional, backend should ideally guarantee structure)
                // const requiredSections = ["tradingAccounts", "orderHistory", "positions", "accountStatement", "accountInfo"];
                // for (const section of requiredSections) {
                //      if (!(section in data) || !data[section as keyof AccountDetailsResponse]?.headers || !data[section as keyof AccountDetailsResponse]?.data) {
                //           console.warn(`Account details validation warning: Section "${section}" is missing or invalid.`);
                //           // Optionally normalize structure here if needed for robust rendering
                //           if (!(section in data) || !data[section as keyof AccountDetailsResponse]) {
                //                (data as any)[section] = { headers: [], data: [] };
                //            }
                //      }
                // }

                return data;
            } catch (error) {
                console.error(
                    "Error during account details fetch queryFn:",
                    error,
                );
                // Throw the error so react-query can handle the error state
                throw error instanceof Error
                    ? error
                    : new Error("Unknown fetch error");
            } finally {
                // console.log("Finished account details fetch attempt.");
            }
        },
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 3 * 60 * 1000, // 3 minutes stale time
    });

    // --- Fetch Logs --- Use the imported type
    const {
        data: accountLogs,
        error: accountLogsError, // This is the query-level error
        refetch: refetchAccountLogs,
        isFetching: isFetchingAccountLogs,
        isLoading: isInitialLoadingAccountLogs, // Use isLoading for initial load state
    } = useQuery<AccountLogsResponse, Error>({
        queryKey: [`/api/account-logs/${id}`],
        enabled: showLogs, // Only fetch when enabled by the user clicking "View Logs"
        queryFn: async () => {
            try {
                // console.log(`Fetching account logs for connection ID: ${id}`);
                // *** IMPORTANT: Ensure this backend endpoint exists ***
                const res = await apiRequest("GET", `/api/account-logs/${id}`);
                if (!res.ok) {
                    const errorData = await res
                        .json()
                        .catch(() => ({
                            message: "Failed to parse error response",
                        }));
                    throw new Error(
                        errorData.message ||
                            `HTTP error! status: ${res.status}`,
                    );
                }
                const data: AccountLogsResponse = await res.json();
                // console.log("Received account logs data structure:", data);

                if (!data || typeof data !== "object" || !data.dataSource) {
                    console.error(
                        "Invalid data format received from account logs API:",
                        data,
                    );
                    throw new Error(
                        "Invalid data format received from logs API.",
                    );
                }

                // Log based on dataSource status from backend
                if (
                    data.dataSource === "error" ||
                    data.dataSource === "error_auth" ||
                    data.dataSource === "partial_error"
                ) {
                    const errorMessage =
                        data.message || "Failed to fetch logs completely";
                    console.warn(
                        `Account logs fetch issues (dataSource: ${data.dataSource}). Message: ${errorMessage}`,
                    );
                    // Don't throw here, let the UI handle it
                }

                // Basic validation (optional)
                // const requiredLogSections = ["tradeLog", "dailyActivityLog", "outstandingLog"];
                // for (const section of requiredLogSections) {
                //      if (!(section in data) || !data[section as keyof AccountLogsResponse]?.headers || !data[section as keyof AccountLogsResponse]?.data) {
                //           console.warn(`Account logs validation warning: Section "${section}" is missing or invalid.`);
                //            if (!(section in data) || !data[section as keyof AccountLogsResponse]) {
                //                (data as any)[section] = { headers: [], data: [] };
                //            }
                //      }
                // }

                return data;
            } catch (error) {
                console.error(
                    "Error during account logs fetch queryFn:",
                    error,
                );
                // Throw the error for react-query
                throw error instanceof Error
                    ? error
                    : new Error("Unknown log fetch error");
            } finally {
                // console.log("Finished account logs fetch attempt.");
            }
        },
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 3 * 60 * 1000, // 3 minutes stale time
    });

    const isLoading = connectionLoading || exchangesLoading || brokersLoading; // Initial page load

    const handleCredentialChange = (key: string, value: string) => {
        setCredentials((prev) => ({ ...prev, [key]: value }));
    };

    const handleUpdateCredentials = () => {
        updateCredentialsMutation.mutate(credentials);
    };

    // Memoize credential fields calculation
    const credentialFields = useMemo(() => {
        const fields = [];
        if (!connection) {
            return [{ name: "loading", label: "Loading..." }];
        }
        const currentBroker = connection.brokerId
            ? brokers?.find((b) => String(b.id) === String(connection.brokerId))
            : undefined;

        if (connection.authMethod === "api") {
            fields.push({ name: "apiKey", label: "API Key" });
            fields.push({ name: "apiSecret", label: "API Secret" });
        } else if (currentBroker?.name === "AKD") {
            // Use currentBroker safely
            fields.push({ name: "username", label: "Username" });
            fields.push({ name: "password", label: "Password" });
            // Add PIN if required by your setup:
            // fields.push({ name: "pin", label: "PIN Code" });
        } else {
            // Generic fallback for credential-based auth
            fields.push({ name: "username", label: "Username/ID" });
            fields.push({ name: "password", label: "Password" });
        }
        // Add any *extra* fields currently in state but not in the defaults above
        Object.keys(credentials).forEach((key) => {
            if (!fields.some((f) => f.name === key)) {
                const label = key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (str) => str.toUpperCase());
                fields.push({ name: key, label: label });
            }
        });
        return fields;
    }, [connection, brokers, credentials]);

    // --- Determine Status Flags ---

    // Account Details Status
    const accountDetailsAuthFailed =
        accountDetails?.dataSource === "error_auth";
    // Query error OR explicit error from backend API response
    const accountDetailsFetchFailed =
        !!accountDetailsError || accountDetails?.dataSource === "error";
    const accountDetailsPartialError =
        accountDetails?.dataSource === "partial_error";

    // Helper to check if a specific FetchResult section has valid, non-error data
    const hasValidData = (result?: FetchResultType) =>
        result && !result.isErrorState && result.data && result.data.length > 0;

    const hasPositionsData = hasValidData(accountDetails?.positions);
    const hasOrderHistoryData = hasValidData(accountDetails?.orderHistory);
    const hasTradingAccountsData = hasValidData(
        accountDetails?.tradingAccounts,
    );
    const hasAccountStatementData = hasValidData(
        accountDetails?.accountStatement,
    );
    const hasAccountInfoData = hasValidData(accountDetails?.accountInfo);

    // Check if *any* detail section has *any* data rows present, even if it's an error row
    // Used to decide whether to render the Tabs component at all
    const anyDetailsDataPresent =
        accountDetails &&
        !accountDetailsFetchFailed &&
        !accountDetailsAuthFailed && // Only consider if not a complete failure
        ((accountDetails.tradingAccounts?.data?.length ?? 0) > 0 ||
            (accountDetails.orderHistory?.data?.length ?? 0) > 0 ||
            (accountDetails.positions?.data?.length ?? 0) > 0 ||
            (accountDetails.accountStatement?.data?.length ?? 0) > 0 ||
            (accountDetails.accountInfo?.data?.length ?? 0) > 0);

    // Determine default tab based on available VALID data
    const defaultAccountDetailsTabValue = hasPositionsData
        ? "portfolio"
        : hasOrderHistoryData
          ? "orders"
          : hasTradingAccountsData ||
              hasAccountStatementData ||
              hasAccountInfoData
            ? "accounts" // Combine accounts + info into one tab group
            : "portfolio"; // Fallback default

    // Logs Status
    const logsAuthFailed = accountLogs?.dataSource === "error_auth";
    const logsFetchFailed =
        !!accountLogsError || accountLogs?.dataSource === "error";
    const logsPartialError = accountLogs?.dataSource === "partial_error";

    const hasTradeLogData = hasValidData(accountLogs?.tradeLog);
    const hasDailyActivityLogData = hasValidData(accountLogs?.dailyActivityLog);
    const hasOutstandingLogData = hasValidData(accountLogs?.outstandingLog);

    // Check if *any* log section has *any* data rows present
    const anyLogDataPresent =
        accountLogs &&
        !logsFetchFailed &&
        !logsAuthFailed && // Only consider if not complete failure
        ((accountLogs.tradeLog?.data?.length ?? 0) > 0 ||
            (accountLogs.dailyActivityLog?.data?.length ?? 0) > 0 ||
            (accountLogs.outstandingLog?.data?.length ?? 0) > 0);

    // Determine default tab based on available VALID data
    const defaultLogsTabValue = hasTradeLogData
        ? "trade-log"
        : hasDailyActivityLogData
          ? "daily-activity-log"
          : hasOutstandingLogData
            ? "outstanding-log"
            : "trade-log"; // Fallback

    // --- RENDER ---

    if (isLoading) {
        // Main initial loading skeleton for connection info
        return (
            /* ... Skeleton code remains the same ... */
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
                            {[...Array(6)].map((_, i) => (
                                <div
                                    key={i}
                                    className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"
                                >
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-5 w-48 sm:col-span-2" />
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                    <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 sm:px-6 flex justify-between">
                        <Skeleton className="h-10 w-28" />
                        <Skeleton className="h-10 w-28" />
                    </CardFooter>
                </Card>
                {/* Placeholder Skeletons for Details and Logs */}
                <Card>
                    <CardHeader>
                        <Skeleton className="h-7 w-40 mb-2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-7 w-40 mb-2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (connectionError) {
        // Handle specific connection fetch error
        return (
            /* ... Error handling remains the same ... */
            <div className="mt-10">
                <Card>
                    <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10">
                        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
                        <h3 className="text-xl font-medium mb-2">
                            Error Loading Connection
                        </h3>
                        <p className="text-neutral-500 mb-6">
                            Could not load the connection details. Please try
                            again later or check the connection ID.
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

    if (!connection) {
        // Safeguard if connection is null/undefined
        return (
            /* ... Not Found handling remains the same ... */
            <div className="mt-10">
                <Card>
                    <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10">
                        <Info className="h-12 w-12 text-yellow-500 mb-4" />
                        <h3 className="text-xl font-medium mb-2">
                            Connection Not Found
                        </h3>
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

    return (
        <div className="mt-10 space-y-6">
            {/* Connection Details Card */}
            <Card>
                {/* ... CardHeader, CardContent, CardFooter for Connection Info remain the same ... */}
                <CardHeader className="flex flex-row justify-between items-center">
                    <div>
                        <CardTitle className="text-xl">
                            {exchange?.name ||
                                `Exchange ID ${connection.exchangeId}`}
                        </CardTitle>
                        <CardDescription>
                            {broker
                                ? `${broker.name} Connection`
                                : "Direct Exchange Connection"}
                            {connection.accountId
                                ? ` (${connection.accountId})`
                                : ""}
                        </CardDescription>
                    </div>
                    <div className="flex items-center">
                        <span
                            className={`h-3 w-3 ${connection ? "bg-green-500" : "bg-red-500"} rounded-full mr-2 animate-pulse`}
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
                        {/* Fields */}
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
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-neutral-500">
                                Account ID / Username
                            </dt>
                            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 break-all">
                                {connection.accountId ||
                                    credentials.username ||
                                    credentials.userId ||
                                    credentials.apiKey ||
                                    "Not specified"}
                            </dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-neutral-500">
                                Exchange Type
                            </dt>
                            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
                                {exchange?.type || "N/A"}
                            </dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-neutral-500">
                                Market Type
                            </dt>
                            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">
                                {exchange?.marketType || "N/A"}
                            </dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-neutral-500">
                                Broker
                            </dt>
                            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                                {broker ? broker.name : "Direct Connection"}
                            </dd>
                        </div>
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
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-neutral-500">
                                Last Connected
                            </dt>
                            <dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">
                                {connection.lastConnected
                                    ? format(
                                          new Date(connection.lastConnected),
                                          "PPpp",
                                      )
                                    : "Never"}
                            </dd>
                        </div>
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
                        {disconnectMutation.isPending
                            ? "Disconnecting..."
                            : "Disconnect"}
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
                                View detailed information about your trading
                                account
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline" // Keep refresh outline
                            onClick={() => {
                                // console.log("Refreshing account details...");
                                refetchAccountDetails();
                            }}
                            disabled={isFetchingAccountDetails} // Use isFetching for button disable state
                        >
                            {isFetchingAccountDetails ? (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Loading...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh Details
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {
                        isInitialLoadingAccountDetails ? ( // Show skeleton only on initial mount load
                            <div className="flex flex-col space-y-6 pt-4">
                                {[1, 2].map((i) => (
                                    <div key={i} className="space-y-2">
                                        <Skeleton className="h-6 w-1/3" />
                                        <Skeleton className="h-32 w-full" />
                                    </div>
                                ))}
                            </div>
                        ) : accountDetailsAuthFailed ? ( // Highest priority error
                            <Card className="border border-red-200 bg-red-50 mt-4">
                                <CardContent className="pt-6">
                                    <div className="flex items-center text-red-800">
                                        <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                                        <p>
                                            Authentication failed. Cannot
                                            retrieve account details. Please
                                            verify your credentials.{" "}
                                            {accountDetails?.message
                                                ? `(Details: ${accountDetails.message})`
                                                : ""}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : accountDetailsFetchFailed ? ( // Next priority: general fetch failure
                            <Card className="border border-yellow-200 bg-yellow-50 mt-4">
                                <CardContent className="pt-6">
                                    <div className="flex items-center text-yellow-800">
                                        <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                                        <p>
                                            Failed to load account details.{" "}
                                            {/* Use query error first, then backend message */}
                                            {accountDetailsError?.message ||
                                                accountDetails?.message ||
                                                "Please try refreshing."}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : accountDetailsPartialError ? ( // Lower priority: partial failure message
                            <Card className="border border-orange-200 bg-orange-50 mt-4">
                                <CardContent className="pt-6">
                                    <div className="flex items-center text-orange-800">
                                        <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                                        <p>
                                            Could not load all account details.
                                            Some sections might be unavailable
                                            or show errors below.{" "}
                                            {accountDetails?.message
                                                ? `(Details: ${accountDetails.message})`
                                                : ""}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : null /* Don't show a message if loading succeeded */
                    }

                    {/* Render Tabs/Data only if not initial loading AND no full auth/fetch failure */}
                    {!isInitialLoadingAccountDetails &&
                        !accountDetailsAuthFailed &&
                        !accountDetailsFetchFailed && // Don't render tabs if whole fetch failed
                        (anyDetailsDataPresent ? ( // Render tabs if *any* data (even errors in subsections) exists
                            <Tabs
                                defaultValue={defaultAccountDetailsTabValue}
                                className="w-full mt-4"
                            >
                                <TabsList className="w-full justify-start border-b pb-0 mb-4 overflow-x-auto">
                                    {/* Render triggers only if the section exists in the response */}
                                    {accountDetails?.positions && (
                                        <TabsTrigger value="portfolio">
                                            <BarChart3 className="h-4 w-4 mr-2" />
                                            Portfolio
                                        </TabsTrigger>
                                    )}
                                    {accountDetails?.orderHistory && (
                                        <TabsTrigger value="orders">
                                            <ListFilter className="h-4 w-4 mr-2" />
                                            Orders
                                        </TabsTrigger>
                                    )}
                                    {(accountDetails?.tradingAccounts ||
                                        accountDetails?.accountStatement ||
                                        accountDetails?.accountInfo) && (
                                        <TabsTrigger value="accounts">
                                            <Key className="h-4 w-4 mr-2" />
                                            Accounts & Info
                                        </TabsTrigger>
                                    )}
                                </TabsList>

                                {/* Portfolio Tab */}
                                {accountDetails?.positions && (
                                    <TabsContent
                                        value="portfolio"
                                        className="mt-2"
                                    >
                                        <DataTableAccordion
                                            title="Portfolio Positions"
                                            fetchResult={
                                                accountDetails.positions
                                            }
                                            isLoading={
                                                isFetchingAccountDetails &&
                                                !accountDetails.positions
                                            } // More specific loading
                                            error={
                                                accountDetails.positions
                                                    ?.errorMessage
                                            } // Pass section-specific error
                                            defaultOpen={true}
                                        />
                                    </TabsContent>
                                )}
                                {/* Orders Tab */}
                                {accountDetails?.orderHistory && (
                                    <TabsContent
                                        value="orders"
                                        className="mt-2"
                                    >
                                        <DataTableAccordion
                                            title="Order History"
                                            fetchResult={
                                                accountDetails.orderHistory
                                            }
                                            isLoading={
                                                isFetchingAccountDetails &&
                                                !accountDetails.orderHistory
                                            }
                                            error={
                                                accountDetails.orderHistory
                                                    ?.errorMessage
                                            }
                                            defaultOpen={
                                                defaultAccountDetailsTabValue ===
                                                "orders"
                                            } // Open if default
                                        />
                                    </TabsContent>
                                )}
                                {/* Accounts & Info Tab */}
                                {(accountDetails?.tradingAccounts ||
                                    accountDetails?.accountStatement ||
                                    accountDetails?.accountInfo) && (
                                    <TabsContent
                                        value="accounts"
                                        className="mt-2 space-y-4"
                                    >
                                        {accountDetails?.tradingAccounts && (
                                            <DataTableAccordion
                                                title="Trading Accounts"
                                                fetchResult={
                                                    accountDetails.tradingAccounts
                                                }
                                                isLoading={
                                                    isFetchingAccountDetails &&
                                                    !accountDetails.tradingAccounts
                                                }
                                                error={
                                                    accountDetails
                                                        .tradingAccounts
                                                        ?.errorMessage
                                                }
                                                defaultOpen={true} // Always open first item in combined tab
                                            />
                                        )}
                                        {accountDetails?.accountInfo && (
                                            <DataTableAccordion
                                                title="Account Info Summary"
                                                fetchResult={
                                                    accountDetails.accountInfo
                                                }
                                                isLoading={
                                                    isFetchingAccountDetails &&
                                                    !accountDetails.accountInfo
                                                }
                                                error={
                                                    accountDetails.accountInfo
                                                        ?.errorMessage
                                                }
                                                maxHeight="300px" // Less height for summary
                                                // defaultOpen={true} // Optionally open
                                            />
                                        )}
                                        {accountDetails?.accountStatement && (
                                            <DataTableAccordion
                                                title="Account Statement"
                                                fetchResult={
                                                    accountDetails.accountStatement
                                                }
                                                isLoading={
                                                    isFetchingAccountDetails &&
                                                    !accountDetails.accountStatement
                                                }
                                                error={
                                                    accountDetails
                                                        .accountStatement
                                                        ?.errorMessage
                                                }
                                                // defaultOpen={false} // Keep statement closed by default
                                            />
                                        )}
                                    </TabsContent>
                                )}
                            </Tabs>
                        ) : (
                            // If loading finished, no errors, but no sections have any data rows
                            <div className="text-center py-10 mt-4">
                                <p className="text-neutral-500">
                                    No detailed account information found for
                                    this connection.
                                </p>
                            </div>
                        ))}
                </CardContent>
            </Card>

            {/* ----- NEW Logs Section ----- */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="flex items-center">
                                <ClipboardList className="h-5 w-5 mr-2" /> Logs
                            </CardTitle>
                            <CardDescription>
                                View trade, activity, and outstanding logs
                                (requires refresh)
                            </CardDescription>
                        </div>
                        <Button
                            variant={showLogs ? "outline" : "default"} // Default to encourage viewing, outline to refresh
                            onClick={() => {
                                if (!showLogs) {
                                    // console.log("Setting showLogs to true, query will be enabled...");
                                    setShowLogs(true); // This enables the query automatically
                                } else {
                                    // console.log("Refreshing logs...");
                                    refetchAccountLogs(); // Manually trigger refetch if already shown
                                }
                            }}
                            disabled={isFetchingAccountLogs} // Disable while fetching/refetching
                        >
                            {isFetchingAccountLogs ? (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Loading...
                                </>
                            ) : showLogs ? (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh Logs
                                </>
                            ) : (
                                <>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Logs
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>

                {showLogs && ( // Only render content if logs are requested
                    <CardContent>
                        {
                            isInitialLoadingAccountLogs ? ( // Skeleton only on initial log load request
                                <div className="flex flex-col space-y-6 pt-4">
                                    {[1, 2, 3].map((i) => (
                                        <div
                                            key={`log-skeleton-${i}`}
                                            className="space-y-2"
                                        >
                                            <Skeleton className="h-6 w-1/3" />
                                            <Skeleton className="h-32 w-full" />
                                        </div>
                                    ))}
                                </div>
                            ) : logsAuthFailed ? ( // Highest priority error
                                <Card className="border border-red-200 bg-red-50 mt-4">
                                    <CardContent className="pt-6">
                                        <div className="flex items-center text-red-800">
                                            <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                                            <p>
                                                Authentication failed. Cannot
                                                retrieve logs.{" "}
                                                {accountLogs?.message
                                                    ? `(Details: ${accountLogs.message})`
                                                    : ""}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : logsFetchFailed ? ( // Next: general fetch failure
                                <Card className="border border-yellow-200 bg-yellow-50 mt-4">
                                    <CardContent className="pt-6">
                                        <div className="flex items-center text-yellow-800">
                                            <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                                            <p>
                                                Failed to load logs.{" "}
                                                {/* Use query error first, then backend message */}
                                                {accountLogsError?.message ||
                                                    accountLogs?.message ||
                                                    "Please try refreshing."}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : logsPartialError ? ( // Lower priority: partial failure
                                <Card className="border border-orange-200 bg-orange-50 mt-4">
                                    <CardContent className="pt-6">
                                        <div className="flex items-center text-orange-800">
                                            <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                                            <p>
                                                Could not load all logs. Some
                                                sections might be unavailable or
                                                show errors below.{" "}
                                                {accountLogs?.message
                                                    ? `(Details: ${accountLogs.message})`
                                                    : ""}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : null /* No top-level message if loading succeeded */
                        }

                        {/* Render Tabs/Data only if not initial loading AND no full auth/fetch failure */}
                        {!isInitialLoadingAccountLogs &&
                            !logsAuthFailed &&
                            !logsFetchFailed &&
                            (anyLogDataPresent ? ( // Render tabs if *any* log data exists
                                <Tabs
                                    defaultValue={defaultLogsTabValue}
                                    className="w-full mt-4"
                                >
                                    <TabsList className="w-full justify-start border-b pb-0 mb-4 overflow-x-auto">
                                        {/* Render triggers only if the section exists in the response */}
                                        {accountLogs?.tradeLog && (
                                            <TabsTrigger value="trade-log">
                                                <BookOpen className="h-4 w-4 mr-2" />
                                                Trade Log
                                            </TabsTrigger>
                                        )}
                                        {accountLogs?.dailyActivityLog && (
                                            <TabsTrigger value="daily-activity-log">
                                                <Activity className="h-4 w-4 mr-2" />
                                                Daily Activity
                                            </TabsTrigger>
                                        )}
                                        {accountLogs?.outstandingLog && (
                                            <TabsTrigger value="outstanding-log">
                                                <AlertTriangle className="h-4 w-4 mr-2" />{" "}
                                                {/* Using Alert for outstanding */}
                                                Outstanding
                                            </TabsTrigger>
                                        )}
                                    </TabsList>

                                    {/* Trade Log Tab */}
                                    {accountLogs?.tradeLog && (
                                        <TabsContent
                                            value="trade-log"
                                            className="mt-2"
                                        >
                                            <DataTableAccordion
                                                title="Trade Log"
                                                fetchResult={
                                                    accountLogs.tradeLog
                                                }
                                                isLoading={
                                                    isFetchingAccountLogs &&
                                                    !accountLogs.tradeLog
                                                } // Specific loading
                                                error={
                                                    accountLogs.tradeLog
                                                        ?.errorMessage
                                                } // Pass specific error
                                                maxHeight="600px" // Allow more height for logs potentially
                                                defaultOpen={true} // Open first tab by default
                                            />
                                        </TabsContent>
                                    )}
                                    {/* Daily Activity Log Tab */}
                                    {accountLogs?.dailyActivityLog && (
                                        <TabsContent
                                            value="daily-activity-log"
                                            className="mt-2"
                                        >
                                            <DataTableAccordion
                                                title="Daily Activity Log"
                                                fetchResult={
                                                    accountLogs.dailyActivityLog
                                                }
                                                isLoading={
                                                    isFetchingAccountLogs &&
                                                    !accountLogs.dailyActivityLog
                                                }
                                                error={
                                                    accountLogs.dailyActivityLog
                                                        ?.errorMessage
                                                }
                                                maxHeight="600px"
                                                defaultOpen={
                                                    defaultLogsTabValue ===
                                                    "daily-activity-log"
                                                } // Open if default
                                            />
                                        </TabsContent>
                                    )}
                                    {/* Outstanding Log Tab */}
                                    {accountLogs?.outstandingLog && (
                                        <TabsContent
                                            value="outstanding-log"
                                            className="mt-2"
                                        >
                                            <DataTableAccordion
                                                title="Outstanding Log"
                                                fetchResult={
                                                    accountLogs.outstandingLog
                                                }
                                                isLoading={
                                                    isFetchingAccountLogs &&
                                                    !accountLogs.outstandingLog
                                                }
                                                error={
                                                    accountLogs.outstandingLog
                                                        ?.errorMessage
                                                }
                                                maxHeight="600px"
                                                defaultOpen={
                                                    defaultLogsTabValue ===
                                                    "outstanding-log"
                                                } // Open if default
                                            />
                                        </TabsContent>
                                    )}
                                </Tabs>
                            ) : (
                                // If logs were fetched successfully but all sections are empty or errored out individually
                                <div className="text-center py-10 mt-4">
                                    <p className="text-neutral-500">
                                        No log data available for this
                                        connection, or the fetch resulted in
                                        errors for all log types.
                                    </p>
                                    {/* Optionally show the overall error message if available */}
                                    {accountLogs?.message && (
                                        <p className="text-sm text-neutral-400 mt-2">
                                            ({accountLogs.message})
                                        </p>
                                    )}
                                </div>
                            ))}
                    </CardContent>
                )}
            </Card>
            {/* ----- End Logs Section ----- */}

            {/* Edit Credentials Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Connection Credentials</DialogTitle>
                        <DialogDescription>
                            Update credentials for {exchange?.name}{" "}
                            {broker ? `(${broker.name})` : ""}. Changes will
                            trigger a data refresh.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {credentialFields.length === 0 ||
                        credentialFields[0]?.name === "loading" ? (
                            <p className="text-neutral-500 text-center">
                                Loading credential fields...
                            </p>
                        ) : (
                            credentialFields.map((field) => (
                                <div
                                    className="grid grid-cols-4 items-center gap-4"
                                    key={field.name}
                                >
                                    <Label
                                        htmlFor={field.name}
                                        className="text-right"
                                    >
                                        {field.label}
                                    </Label>
                                    <Input
                                        id={field.name}
                                        type={
                                            /password|secret|pin/i.test(
                                                field.name,
                                            )
                                                ? "password"
                                                : "text"
                                        }
                                        className="col-span-3"
                                        value={credentials[field.name] || ""}
                                        onChange={(e) =>
                                            handleCredentialChange(
                                                field.name,
                                                e.target.value,
                                            )
                                        }
                                        autoComplete="new-password" // Prevent browser autofill
                                    />
                                </div>
                            ))
                        )}
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

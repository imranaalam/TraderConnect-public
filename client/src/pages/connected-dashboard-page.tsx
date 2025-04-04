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
import { Badge } from "@/components/ui/badge"; // Keep Badge if used elsewhere, otherwise remove
import { useToast } from "@/hooks/use-toast";

// --- Define Types Used in Component ---
// (Assuming these are defined correctly, mirroring backend/shared types)
interface Connection {
    id: string | number;
    exchangeId: string | number;
    brokerId?: string | number | null;
    authMethod: "api" | "credentials";
    accountId?: string | null; // May be populated after connection
    credentials?: Record<string, any> | null;
    lastConnected?: string | null;
    isActive: boolean;
    isDefault: boolean;
    userId: number; // Ensure this is available from auth context
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
// --- End Type Definitions ---

import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
    Edit,
    Key,
    RefreshCw,
    Eye,
    Info,
    ListFilter,
    BarChart3,
    ClipboardList, // Icon for Logs card
    BookOpen, // Icon for Trade Log
    Activity, // Icon for Daily Activity Log
    AlertTriangle, // Icon for Outstanding Log or Errors
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useState, useMemo } from "react";
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

// --- Import Types from Backend Client ---
// Assuming akdApiClient.ts is adjacent or alias path is setup
// Use AllAccountDetails directly for the /api/account-details response type
import type {
    AllAccountDetails as AccountDetailsResponse,
    FetchResult as FetchResultType,
} from "./brokers/akdApiClient"; // Adjust path if needed

// Define the specific type expected from the /api/account-logs endpoint
interface AccountLogsResponse {
    tradeLogs: FetchResultType;
    activityLogs: FetchResultType;
    outstandingLogs: FetchResultType;
    // Optional properties if backend includes them for context
    dataSource?: 'api' | 'api_with_errors' | 'error' | 'error_auth';
    message?: string; // Optional overall message for the log fetch operation
}
// --- End Type Imports ---


// --- Helper Component for Rendering Tables ---
interface DataTableProps {
    title: string;
    fetchResult?: FetchResultType;
    isLoading?: boolean;
    error?: string | null; // Explicit error message for this specific section
    maxHeight?: string;
    defaultOpen?: boolean; // Will default to true now
    visibleColumns?: string[]; // NEW: Optional array of header names to display
}

const DataTableAccordion: React.FC<DataTableProps> = ({
    title,
    fetchResult,
    isLoading,
    error, // Prioritize passed error prop
    maxHeight = "500px",
    defaultOpen = true, // <-- CHANGED: Default to true
    visibleColumns, // <-- NEW PROP
}) => {
    const displayError = error || fetchResult?.error;
    const isError = !!displayError;
    const hasRawData = fetchResult?.data && fetchResult.data.length > 0;
    const hasRawHeaders = fetchResult?.headers && fetchResult.headers.length > 0;
    const accordionValue = title.toLowerCase().replace(/\s+/g, "-");

    // --- NEW: Column Filtering Logic ---
    const { displayHeaders, displayColumnIndices } = useMemo(() => {
        if (!hasRawHeaders || !fetchResult?.headers) {
            return { displayHeaders: [], displayColumnIndices: [] };
        }

        if (!visibleColumns || visibleColumns.length === 0) {
            // No filter provided, show all columns
            return {
                displayHeaders: fetchResult.headers,
                displayColumnIndices: fetchResult.headers.map((_, index) => index),
            };
        }

        // Filter columns based on visibleColumns prop
        const indices: number[] = [];
        const headers: string[] = [];
        fetchResult.headers.forEach((header, index) => {
            if (visibleColumns.includes(header)) {
                headers.push(header);
                indices.push(index);
            }
        });
        return { displayHeaders: headers, displayColumnIndices: indices };

    }, [fetchResult?.headers, hasRawHeaders, visibleColumns]);

    // Adjust data validity check based on *filtered* columns
    const hasValidData = hasRawData && !isError && displayHeaders.length > 0;
    // --- End Column Filtering Logic ---


    if (isLoading) {
        return (
            <Accordion type="single" collapsible className="w-full" defaultValue={accordionValue}>
                <AccordionItem value={accordionValue} className="border-b">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline">{title}</AccordionTrigger>
                    <AccordionContent><div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-20 w-full" /></div></AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    // Display explicit error state first
    if (isError) {
        return (
            <Accordion type="single" collapsible className="w-full" defaultValue={accordionValue}>
                <AccordionItem value={accordionValue} className="border-b border-red-200 bg-red-50/50">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline text-red-700">
                        <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" /> {title} - Error
                    </AccordionTrigger>
                    <AccordionContent><div className="p-4 text-red-600 rounded"><p>{displayError}</p></div></AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    // If no error, check if data is missing, empty, or no columns selected
    if (!hasValidData) {
        const message = !hasRawData ? "No data available." :
                        displayHeaders.length === 0 && visibleColumns && visibleColumns.length > 0 ? "No matching columns found for the specified filter." :
                        "No data to display for selected columns.";
        return (
            <Accordion type="single" collapsible className="w-full" defaultValue={defaultOpen ? accordionValue : undefined}>
                <AccordionItem value={accordionValue} className="border-b">
                    <AccordionTrigger className="text-lg font-semibold hover:no-underline">{title}</AccordionTrigger>
                    <AccordionContent><p className="p-4 text-neutral-500">{message}</p></AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    // Render the table if data exists and no error
    return (
        <Accordion type="single" collapsible className="w-full" defaultValue={defaultOpen ? accordionValue : undefined}>
            <AccordionItem value={accordionValue} className="border-b">
                <AccordionTrigger className="text-lg font-semibold hover:no-underline">{title}</AccordionTrigger>
                <AccordionContent>
                    <div className="overflow-x-auto relative" style={{ maxHeight: maxHeight }}>
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                                <TableRow>
                                    {/* Use filtered headers */}
                                    {displayHeaders.map((h, i) => (
                                        <TableHead key={`${title}-header-${i}`} className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm">
                                            {h || `Col_${i + 1}`}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fetchResult.data.map((row, i) => (
                                    <TableRow key={`${title}-row-${i}`} className={i % 2 === 0 ? "bg-muted/30 hover:bg-muted/60" : "hover:bg-muted/60"}>
                                        {Array.isArray(row) ? (
                                            // Use filtered indices to get the correct cell data
                                            displayColumnIndices.map((colIndex, j) => (
                                                <TableCell key={`${title}-cell-${i}-${j}`} className="text-xs whitespace-nowrap px-3 py-1.5">
                                                    {row[colIndex] === null || row[colIndex] === undefined || row[colIndex] === "" ? "-" : String(row[colIndex])}
                                                </TableCell>
                                            ))
                                        ) : (
                                             <TableCell colSpan={displayHeaders.length} className="text-xs text-red-500">Invalid row data format</TableCell>
                                        )}
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


// --- Main Page Component ---
export default function ConnectedDashboardPage() {
    const { id } = useParams<{ id: string }>();
    const { toast } = useToast();
    const [_, setLocation] = useLocation();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [credentials, setCredentials] = useState<Record<string, string>>({});
    const [showLogs, setShowLogs] = useState(false); // Logs section closed by default

    // --- React Query Hooks ---

    // Fetch connection details
    const {
        data: connection,
        isLoading: connectionLoading,
        error: connectionError,
    } = useQuery<Connection, Error>({
        queryKey: ["/api/connections", id],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/connections/${id}`);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: "Failed to parse connection error" }));
                throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
            }
            const data = await res.json();
            // Pre-fill credentials state if available
            if (data?.credentials && typeof data.credentials === "object") {
                const stringCredentials: Record<string, string> = {};
                for (const key in data.credentials) {
                    if (Object.prototype.hasOwnProperty.call(data.credentials, key)) {
                        stringCredentials[key] = String(data.credentials[key] ?? "");
                    }
                }
                setCredentials(stringCredentials);
            }
            return data;
        },
        retry: 1,
        staleTime: 5 * 60 * 1000, // Cache connection details for 5 mins
    });

    // Fetch all exchanges (for display purposes)
    const { data: exchanges, isLoading: exchangesLoading } = useQuery<Exchange[], Error>({
        queryKey: ["/api/exchanges"],
        queryFn: async () => {
            const res = await apiRequest("GET", "/api/exchanges");
            if (!res.ok) throw new Error("Failed to fetch exchanges");
            return await res.json();
        },
        staleTime: Infinity, // Cache exchanges indefinitely
    });

    // Fetch brokers for the connection's exchange (for display purposes)
    const { data: brokers, isLoading: brokersLoading } = useQuery<Broker[], Error>({
        queryKey: ["/api/brokers", connection?.exchangeId],
        enabled: !!connection?.exchangeId, // Only run if connection has loaded and has an exchangeId
        queryFn: async ({ queryKey }) => {
            const [, exchangeId] = queryKey as [string, string | number];
            const res = await apiRequest("GET", `/api/brokers/${exchangeId}`);
            if (!res.ok) throw new Error("Failed to fetch brokers");
            return await res.json();
        },
        staleTime: Infinity, // Cache brokers indefinitely
    });

    // Fetch Account Details (uses AllAccountDetails type from client via backend)
    const {
        data: accountDetails,
        error: accountDetailsError,
        refetch: refetchAccountDetails,
        isFetching: isFetchingAccountDetails,
        isLoading: isInitialLoadingAccountDetails, // Separate state for initial load vs refetch
    } = useQuery<AccountDetailsResponse, Error>({
        queryKey: [`/api/account-details/${id}`],
        enabled: !!connection, // Enable only when connection data is loaded
        queryFn: async () => {
            console.log(`[Details Query] Fetching for connection ID: ${id}`);
            const res = await apiRequest("GET", `/api/account-details/${id}`);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: "Failed to parse details error response" }));
                console.error(`[Details Query] Fetch failed with status ${res.status}:`, errorData);
                throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
            }
            const data: AccountDetailsResponse = await res.json();
            console.log(`[Details Query] Received data source: ${data?.dataSource}`);
            // Basic structure validation
            if (!data || typeof data !== 'object' || typeof data.dataSource !== 'string') {
                 console.error("[Details Query] Invalid data format received:", data);
                 throw new Error("Invalid data format received for account details.");
            }
            return data;
        },
        retry: (failureCount, error) => {
            if (error.message.includes("401") || /auth failed/i.test(error.message)) {
                return false;
            }
            return failureCount < 2;
        },
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
    });

    // Fetch Account Logs (uses AccountLogsResponse type)
    const {
        data: accountLogs,
        error: accountLogsError,
        refetch: refetchAccountLogs,
        isFetching: isFetchingAccountLogs,
        isLoading: isInitialLoadingAccountLogs,
    } = useQuery<AccountLogsResponse, Error>({
        queryKey: [`/api/account-logs/${id}`],
        enabled: showLogs && !!connection,
        queryFn: async () => {
            console.log(`[Logs Query] Fetching for connection ID: ${id}`);
            const res = await apiRequest("GET", `/api/account-logs/${id}`);
            if (!res.ok) {
                 const errorData = await res.json().catch(() => ({ message: "Failed to parse logs error response" }));
                 console.error(`[Logs Query] Fetch failed with status ${res.status}:`, errorData);
                 throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
            }
            const data: AccountLogsResponse = await res.json();
             console.log(`[Logs Query] Received data source: ${data?.dataSource}`);
             if (!data || typeof data !== 'object' || !data.tradeLogs || !data.activityLogs || !data.outstandingLogs) {
                  console.error("[Logs Query] Invalid data format received:", data);
                  throw new Error("Invalid data format received for logs.");
             }
            return data;
        },
         retry: (failureCount, error) => {
             if (error.message.includes("401") || /auth failed/i.test(error.message)) {
                 return false;
             }
             return failureCount < 2;
        },
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
    });

    // --- Mutations ---
    const disconnectMutation = useMutation({
        mutationFn: async () => apiRequest("DELETE", `/api/connections/${id}`),
        onSuccess: () => {
            toast({ title: "Disconnected", description: "Connection removed successfully." });
            queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
            setLocation("/");
        },
        onError: (error: Error) => {
            console.error("Disconnection mutation error:", error);
            toast({ title: "Disconnection Failed", description: error.message, variant: "destructive" });
        },
    });

    const updateCredentialsMutation = useMutation({
        mutationFn: async (updatedCredentials: Record<string, string>) => {
            const res = await apiRequest("PATCH", `/api/connections/${id}`, { credentials: updatedCredentials });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: "Failed to parse update error" }));
                throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
            }
            return await res.json();
        },
        onSuccess: () => {
            toast({ title: "Credentials Updated", description: "Credentials saved successfully." });
            queryClient.invalidateQueries({ queryKey: ["/api/connections", id] });
            console.log("Credentials updated, refetching details...");
            refetchAccountDetails();
            if (showLogs) {
                console.log("...and refetching logs.");
                refetchAccountLogs();
            }
            setIsEditDialogOpen(false);
        },
        onError: (error: Error) => {
            console.error("Credentials update mutation error:", error);
            toast({ title: "Update Failed", description: error.message, variant: "destructive" });
        },
    });

    // --- Event Handlers ---
    const handleCredentialChange = (key: string, value: string) => {
        setCredentials((prev) => ({ ...prev, [key]: value }));
    };

    const handleUpdateCredentials = () => {
        updateCredentialsMutation.mutate(credentials);
    };

    const handleToggleLogs = () => {
        if (!showLogs) {
            console.log("User clicked 'View Logs'. Setting showLogs=true.");
            setShowLogs(true);
        } else {
            console.log("User clicked 'Refresh Logs'. Triggering refetch.");
            refetchAccountLogs();
        }
    };

    // --- Memoized Values & Status Flags ---
    const isLoadingPage = connectionLoading || exchangesLoading || brokersLoading;

    const credentialFields = useMemo(() => {
         // ... (credentialFields logic remains the same)
         const fields = [];
         if (!connection || brokersLoading || exchangesLoading) {
             return [{ name: "loading", label: "Loading..." }];
         }
         const currentBroker = connection.brokerId ? brokers?.find(b => String(b.id) === String(connection.brokerId)) : undefined;
         const currentExchange = exchanges?.find(e => String(e.id) === String(connection.exchangeId));

         if (connection.authMethod === 'api') {
             fields.push({ name: 'apiKey', label: 'API Key' });
             fields.push({ name: 'apiSecret', label: 'API Secret' });
             // Check based on current state, not just connection.credentials
             if (credentials && typeof credentials.passphrase === 'string') fields.push({ name: 'passphrase', label: 'Passphrase' });
         } else if (currentBroker?.name === 'AKD') {
             fields.push({ name: 'username', label: 'Username' });
             fields.push({ name: 'password', label: 'Password' });
         } else if (currentBroker?.name === 'MKK') {
              fields.push({ name: 'accountId', label: 'Account ID' });
              fields.push({ name: 'password', label: 'Password' });
         } else if (currentBroker?.name === 'Zerodha') {
             fields.push({ name: 'userId', label: 'User ID' });
             fields.push({ name: 'password', label: 'Password' });
              fields.push({ name: 'pin', label: 'PIN' });
         } else if (currentExchange?.name === 'Binance') {
              fields.push({ name: 'apiKey', label: 'API Key' });
              fields.push({ name: 'apiSecret', label: 'API Secret' });
         }
         else {
             // Default case or add more specific broker logic
             fields.push({ name: 'username', label: 'Username/ID' });
             fields.push({ name: 'password', label: 'Password' });
         }
         // Add any other credentials fields present in the state but not covered above
         Object.keys(credentials).forEach(key => {
             if (!fields.some(f => f.name === key)) {
                 const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                 fields.push({ name: key, label });
             }
         });
         return fields;
    }, [connection, brokers, exchanges, credentials, brokersLoading, exchangesLoading]);

    // Status Flags (remain the same)
    const accountDetailsAuthFailed = accountDetails?.dataSource === "error_auth";
    const accountDetailsFetchFailed = !!accountDetailsError || accountDetails?.dataSource === "error";
    const accountDetailsPartialError = accountDetails?.dataSource === "api_with_errors";
    const hasValidData = (result?: FetchResultType) => result?.data && result.data.length > 0 && !result.error;
    const hasPositionsData = hasValidData(accountDetails?.positions);
    const hasOrderHistoryData = hasValidData(accountDetails?.orderHistory);
    const hasTradingAccountsData = hasValidData(accountDetails?.tradingAccounts);
    const hasAccountStatementData = hasValidData(accountDetails?.accountStatement);
    const hasAccountInfoData = hasValidData(accountDetails?.accountInfo);
    const anyDetailsDataPresent = accountDetails && !accountDetailsFetchFailed && !accountDetailsAuthFailed &&
         [
             accountDetails.tradingAccounts, accountDetails.orderHistory, accountDetails.positions,
             accountDetails.accountStatement, accountDetails.accountInfo
         ].some(section => section?.data?.length ?? 0 > 0);
    const defaultAccountDetailsTabValue = hasPositionsData ? "portfolio" : hasOrderHistoryData ? "orders" : (hasTradingAccountsData || hasAccountStatementData || hasAccountInfoData) ? "accounts" : "portfolio";

    const logsAuthFailed = (!!accountLogsError && /auth failed/i.test(accountLogsError.message || '')) || accountLogs?.dataSource === 'error_auth';
    const logsFetchFailed = (!!accountLogsError && !logsAuthFailed) || accountLogs?.dataSource === 'error';
    const logsPartialError = accountLogs?.dataSource === "api_with_errors";
    const hasAnyLogData = (logSection?: FetchResultType) => logSection?.data?.length ?? 0 > 0;
    const anyLogDataPresent = accountLogs && !logsFetchFailed && !logsAuthFailed &&
        (hasAnyLogData(accountLogs.tradeLogs) || hasAnyLogData(accountLogs.activityLogs) || hasAnyLogData(accountLogs.outstandingLogs));
    const defaultLogsTabValue = hasValidData(accountLogs?.tradeLogs) ? "trade-log"
                             : hasValidData(accountLogs?.activityLogs) ? "daily-activity-log"
                             : hasValidData(accountLogs?.outstandingLogs) ? "outstanding-log"
                             : "trade-log"; // Fallback

    // --- RENDER LOGIC ---
    if (isLoadingPage) {
        // ... (skeleton remains the same)
        return (
             <div className="mt-10 space-y-6">
                 <Card><CardHeader className="flex flex-row justify-between items-center"><div><Skeleton className="h-7 w-48 mb-2" /><Skeleton className="h-5 w-32" /></div><Skeleton className="h-6 w-24" /></CardHeader><CardContent className="px-4 py-5 sm:p-0"><dl className="sm:divide-y sm:divide-neutral-200">{[...Array(6)].map((_, i) => (<div key={i} className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-48 sm:col-span-2" /></div>))}</dl></CardContent><CardFooter className="px-4 py-3 bg-neutral-50 border-t sm:px-6 flex justify-between"><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-28" /></CardFooter></Card>
                 <Card><CardHeader><Skeleton className="h-7 w-40 mb-2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
                 <Card><CardHeader><Skeleton className="h-7 w-40 mb-2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
             </div>
        );
    }
    if (connectionError) {
         // ... (error remains the same)
        return (
             <div className="mt-10"><Card><CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10"><AlertTriangle className="h-12 w-12 text-red-500 mb-4" /><h3 className="text-xl font-medium mb-2">Error Loading Connection</h3><p className="text-neutral-500 mb-6">Could not load connection details.<br /><span className="text-xs text-red-600">{connectionError.message}</span></p><Link href="/"><Button variant="outline">Go Back Home</Button></Link></CardContent></Card></div>
        );
    }
    if (!connection) {
        // ... (not found remains the same)
        return (
             <div className="mt-10"><Card><CardContent className="pt-6 flex flex-col items-center justify-center text-center p-10"><Info className="h-12 w-12 text-yellow-500 mb-4" /><h3 className="text-xl font-medium mb-2">Connection Not Found</h3><p className="text-neutral-500 mb-6">Connection '{id}' not found.</p><Link href="/"><Button variant="outline">Go Back Home</Button></Link></CardContent></Card></div>
        );
    }

    // Safe access to exchange/broker after loading checks
    const exchange = exchanges?.find(e => String(e.id) === String(connection.exchangeId));
    const broker = connection.brokerId ? brokers?.find(b => String(b.id) === String(connection.brokerId)) : undefined;

    // --- Final Render ---
    return (
        <div className="mt-10 space-y-6">
            {/* Connection Details Card (remains the same) */}
            <Card>
                <CardHeader className="flex flex-row justify-between items-center">
                    <div>
                        <CardTitle className="text-xl">{exchange?.name || `Exchange ${connection.exchangeId}`}</CardTitle>
                        <CardDescription>{broker ? `${broker.name} Connection` : "Direct Exchange Connection"}{connection.accountId ? ` (${connection.accountId})` : ""}</CardDescription>
                    </div>
                    <div className="flex items-center">
                        <span className={`h-3 w-3 ${connection.isActive ? "bg-green-500" : "bg-neutral-400"} rounded-full mr-2`}></span>
                        <span className={`text-sm ${connection.isActive ? "text-green-600" : "text-neutral-500"} font-medium`}>{connection.isActive ? "Active" : "Inactive"}</span>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pt-0">
                     <dl className="sm:divide-y sm:divide-neutral-200">
                         <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-neutral-500">Auth Method</dt><dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">{connection.authMethod}</dd></div>
                         <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-neutral-500">Identifier</dt><dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 break-all">{connection.accountId || credentials.username || credentials.userId || credentials.apiKey || "Not specified"}</dd></div>
                         <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-neutral-500">Exchange Type</dt><dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">{exchange?.type || "N/A"}</dd></div>
                         <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-neutral-500">Market Type</dt><dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 capitalize">{exchange?.marketType || "N/A"}</dd></div>
                         <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-neutral-500">Broker</dt><dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">{broker ? broker.name : "Direct Connection"}</dd></div>
                         <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-neutral-500">Last Connected</dt><dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2">{connection.lastConnected ? format(new Date(connection.lastConnected), "PPpp") : "Never"}</dd></div>
                         <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-neutral-500">Credentials</dt><dd className="mt-1 text-sm text-neutral-900 sm:mt-0 sm:col-span-2 flex items-center"><span className="mr-3">Stored securely</span><Button size="sm" variant="outline" onClick={() => setIsEditDialogOpen(true)}><Edit className="h-4 w-4 mr-2" />Edit</Button></dd></div>
                     </dl>
                 </CardContent>
                 <CardFooter className="px-4 py-3 bg-neutral-50 border-t sm:px-6 flex justify-between">
                     <Button variant="outline" onClick={() => setLocation("/")}>Back</Button>
                     <Button variant="destructive" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>{disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}</Button>
                 </CardFooter>
            </Card>

            {/* Account Details Section */}
            <Card>
                <CardHeader>
                    {/* Header remains the same */}
                    <div className="flex justify-between items-center">
                        <div><CardTitle>Account Details</CardTitle><CardDescription>Account summary, portfolio, and orders</CardDescription></div>
                        <Button variant="outline" onClick={() => refetchAccountDetails()} disabled={isFetchingAccountDetails}>
                            {isFetchingAccountDetails ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading...</> : <><RefreshCw className="mr-2 h-4 w-4" />Refresh</>}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Loading/Error states remain the same */}
                    {isInitialLoadingAccountDetails ? ( <div className="flex flex-col space-y-6 pt-4">{[1, 2].map(i => <div key={i} className="space-y-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-32 w-full" /></div>)}</div> )
                    : accountDetailsAuthFailed ? ( <Card className="border-red-200 bg-red-50 mt-4"><CardContent className="pt-6"><div className="flex items-center text-red-800"><AlertTriangle className="h-5 w-5 mr-2 shrink-0" /><p>Authentication failed. Cannot retrieve account details. Please check credentials.</p></div></CardContent></Card> )
                    : accountDetailsFetchFailed ? ( <Card className="border-yellow-200 bg-yellow-50 mt-4"><CardContent className="pt-6"><div className="flex items-center text-yellow-800"><Info className="h-5 w-5 mr-2 shrink-0" /><p>Failed to load account details. {accountDetailsError?.message || "Please try refreshing."}</p></div></CardContent></Card> )
                    : accountDetailsPartialError ? ( <Card className="border-orange-200 bg-orange-50 mt-4"><CardContent className="pt-6"><div className="flex items-center text-orange-800"><Info className="h-5 w-5 mr-2 shrink-0" /><p>Could not load all account details. Some sections might show errors.</p></div></CardContent></Card> )
                    : null }

                    {/* Account Details Tabs */}
                    {!isInitialLoadingAccountDetails && !accountDetailsAuthFailed && !accountDetailsFetchFailed && (
                        anyDetailsDataPresent ? (
                            <Tabs defaultValue={defaultAccountDetailsTabValue} className="w-full mt-4">
                                <TabsList className="w-full justify-start border-b pb-0 mb-4 overflow-x-auto">
                                    {accountDetails?.positions && <TabsTrigger value="portfolio"><BarChart3 className="h-4 w-4 mr-2" />Portfolio</TabsTrigger>}
                                    {accountDetails?.orderHistory && <TabsTrigger value="orders"><ListFilter className="h-4 w-4 mr-2" />Orders</TabsTrigger>}
                                    {(accountDetails?.tradingAccounts || accountDetails?.accountStatement || accountDetails?.accountInfo) && <TabsTrigger value="accounts"><Key className="h-4 w-4 mr-2" />Accounts & Info</TabsTrigger>}
                                </TabsList>

                                {/* Portfolio Tab */}
                                {accountDetails?.positions && <TabsContent value="portfolio" className="mt-2">
                                    <DataTableAccordion
                                        title="Portfolio Positions"
                                        fetchResult={accountDetails.positions}
                                        isLoading={isFetchingAccountDetails && !accountDetails.positions}
                                        error={accountDetails.positions?.error}
                                        // EXAMPLE: Uncomment and list the EXACT header names you want to see
                                        // visibleColumns={["Symbol", "Quantity", "Average Price", "Last Price", "Unrealized P/L", "Market Value"]}
                                        // defaultOpen={true} // defaultOpen is now true by default in the component
                                    />
                                </TabsContent>}

                                {/* Orders Tab */}
                                {accountDetails?.orderHistory && <TabsContent value="orders" className="mt-2">
                                    <DataTableAccordion
                                        title="Order History"
                                        fetchResult={accountDetails.orderHistory}
                                        isLoading={isFetchingAccountDetails && !accountDetails.orderHistory}
                                        error={accountDetails.orderHistory?.error}
                                        // EXAMPLE: Uncomment and list the EXACT header names you want to see
                                        // visibleColumns={["Date", "Symbol", "Type", "Side", "Quantity", "Price", "Status"]}
                                    />
                                </TabsContent>}

                                {/* Accounts & Info Tab */}
                                {(accountDetails?.tradingAccounts || accountDetails?.accountStatement || accountDetails?.accountInfo) && (
                                    <TabsContent value="accounts" className="mt-2 space-y-4">
                                        {accountDetails?.tradingAccounts &&
                                            <DataTableAccordion
                                                title="Trading Accounts"
                                                fetchResult={accountDetails.tradingAccounts}
                                                isLoading={isFetchingAccountDetails && !accountDetails.tradingAccounts}
                                                error={accountDetails.tradingAccounts?.error}
                                                // EXAMPLE: Uncomment and list columns
                                                // visibleColumns={["Account ID", "Currency", "Balance", "Equity"]}
                                            />}
                                        {accountDetails?.accountInfo &&
                                            <DataTableAccordion
                                                title="Account Info Summary"
                                                fetchResult={accountDetails.accountInfo}
                                                isLoading={isFetchingAccountDetails && !accountDetails.accountInfo}
                                                error={accountDetails.accountInfo?.error}
                                                maxHeight="300px"
                                                // EXAMPLE: Uncomment and list columns
                                                // visibleColumns={["Property", "Value"]}
                                            />}
                                        {accountDetails?.accountStatement &&
                                            <DataTableAccordion
                                                title="Account Statement"
                                                fetchResult={accountDetails.accountStatement}
                                                isLoading={isFetchingAccountDetails && !accountDetails.accountStatement}
                                                error={accountDetails.accountStatement?.error}
                                                 // EXAMPLE: Uncomment and list columns
                                                // visibleColumns={["Date", "Description", "Debit", "Credit", "Balance"]}
                                            />}
                                    </TabsContent>
                                )}
                            </Tabs>
                        ) : (
                             !accountDetailsAuthFailed && !accountDetailsFetchFailed && <div className="text-center py-10 mt-4"><p className="text-neutral-500">No detailed account information available for this connection.</p></div>
                        )
                    )}
                </CardContent>
            </Card>

             {/* Logs Section */}
             <Card>
                <CardHeader>
                     {/* Header remains the same */}
                     <div className="flex justify-between items-center">
                         <div><CardTitle className="flex items-center"><ClipboardList className="h-5 w-5 mr-2" /> Logs</CardTitle><CardDescription>View trade, activity, and outstanding logs</CardDescription></div>
                         <Button
                             variant={showLogs ? "outline" : "default"}
                             onClick={handleToggleLogs}
                             disabled={isFetchingAccountLogs}
                         >
                             {isFetchingAccountLogs ? (
                                 <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading...</>
                             ) : showLogs ? (
                                 <><RefreshCw className="mr-2 h-4 w-4" />Refresh</>
                             ) : (
                                 <><Eye className="mr-2 h-4 w-4" />View Logs</>
                             )}
                         </Button>
                     </div>
                 </CardHeader>
                 {showLogs && (
                     <CardContent>
                          {/* Loading/Error states remain the same */}
                          {isInitialLoadingAccountLogs ? ( <div className="flex flex-col space-y-6 pt-4">{[1, 2, 3].map(i => <div key={`log-skel-${i}`} className="space-y-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-32 w-full" /></div>)}</div> )
                          : logsAuthFailed ? ( <Card className="border-red-200 bg-red-50 mt-4"><CardContent className="pt-6"><div className="flex items-center text-red-800"><AlertTriangle className="h-5 w-5 mr-2 shrink-0" /><p>Authentication failed. Cannot retrieve logs. Please check credentials.</p></div></CardContent></Card> )
                          : logsFetchFailed ? ( <Card className="border-yellow-200 bg-yellow-50 mt-4"><CardContent className="pt-6"><div className="flex items-center text-yellow-800"><Info className="h-5 w-5 mr-2 shrink-0" /><p>Failed to load logs. {accountLogsError?.message || "Please try refreshing."}</p></div></CardContent></Card> )
                          : logsPartialError ? ( <Card className="border-orange-200 bg-orange-50 mt-4"><CardContent className="pt-6"><div className="flex items-center text-orange-800"><Info className="h-5 w-5 mr-2 shrink-0" /><p>Could not load all logs. Some sections might show errors below.</p></div></CardContent></Card> )
                          : null }

                          {/* Log Tabs */}
                          {!isInitialLoadingAccountLogs && !logsAuthFailed && !logsFetchFailed && (
                              anyLogDataPresent ? (
                                  <Tabs defaultValue={defaultLogsTabValue} className="w-full mt-4">
                                      <TabsList className="w-full justify-start border-b pb-0 mb-4 overflow-x-auto">
                                          {accountLogs?.tradeLogs && <TabsTrigger value="trade-log"><BookOpen className="h-4 w-4 mr-2" />Trade</TabsTrigger>}
                                          {accountLogs?.activityLogs && <TabsTrigger value="daily-activity-log"><Activity className="h-4 w-4 mr-2" />Activity</TabsTrigger>}
                                          {accountLogs?.outstandingLogs && <TabsTrigger value="outstanding-log"><AlertTriangle className="h-4 w-4 mr-2" />Outstanding</TabsTrigger>}
                                      </TabsList>

                                      {/* Trade Log Tab */}
                                      {accountLogs?.tradeLogs && (
                                          <TabsContent value="trade-log" className="mt-2">
                                              <DataTableAccordion
                                                  title="Trade Log"
                                                  fetchResult={accountLogs.tradeLogs}
                                                  isLoading={isFetchingAccountLogs && !accountLogs.tradeLogs}
                                                  error={accountLogs.tradeLogs?.error}
                                                  maxHeight="600px"
                                                  // EXAMPLE: Uncomment and list columns
                                                  // visibleColumns={["Timestamp", "Symbol", "Side", "Quantity", "Price", "Fee"]}
                                              />
                                          </TabsContent>
                                      )}
                                      {/* Activity Log Tab */}
                                      {accountLogs?.activityLogs && (
                                          <TabsContent value="daily-activity-log" className="mt-2">
                                              <DataTableAccordion
                                                  title="Daily Activity Log"
                                                  fetchResult={accountLogs.activityLogs}
                                                  isLoading={isFetchingAccountLogs && !accountLogs.activityLogs}
                                                  error={accountLogs.activityLogs?.error}
                                                  maxHeight="600px"
                                                  // EXAMPLE: Uncomment and list columns
                                                  // visibleColumns={["Date", "Action", "Description", "Amount", "Balance"]}
                                              />
                                          </TabsContent>
                                      )}
                                      {/* Outstanding Log Tab */}
                                      {accountLogs?.outstandingLogs && (
                                          <TabsContent value="outstanding-log" className="mt-2">
                                              <DataTableAccordion
                                                  title="Outstanding Log"
                                                  fetchResult={accountLogs.outstandingLogs}
                                                  isLoading={isFetchingAccountLogs && !accountLogs.outstandingLogs}
                                                  error={accountLogs.outstandingLogs?.error}
                                                  maxHeight="600px"
                                                  // EXAMPLE: Uncomment and list columns
                                                  // visibleColumns={["Symbol", "Net Quantity", "Buy Amount", "Sell Amount", "Net Amount"]}
                                              />
                                          </TabsContent>
                                      )}
                                  </Tabs>
                              ) : (
                                  <div className="text-center py-10 mt-4">
                                      <p className="text-neutral-500">No log data available for this connection.</p>
                                      {accountLogsError && !logsAuthFailed && !logsFetchFailed && (
                                         <p className="text-sm text-neutral-400 mt-2">({accountLogsError.message})</p>
                                      )}
                                  </div>
                              )
                          )}
                     </CardContent>
                 )}
             </Card>

            {/* Edit Credentials Dialog (remains the same) */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                 <DialogContent>
                     <DialogHeader><DialogTitle>Edit Credentials</DialogTitle><DialogDescription>Update credentials for {exchange?.name} {broker ? `(${broker.name})` : ""}.</DialogDescription></DialogHeader>
                     <div className="space-y-4 py-4">
                         {credentialFields.length === 0 || credentialFields[0]?.name === 'loading' ? <p className="text-center text-neutral-500">Loading...</p> :
                             credentialFields.map(field => (
                                 <div className="grid grid-cols-4 items-center gap-4" key={field.name}>
                                     <Label htmlFor={field.name} className="text-right">{field.label}</Label>
                                     <Input id={field.name} type={/password|secret|pin/i.test(field.name) ? "password" : "text"} className="col-span-3" value={credentials[field.name] || ""} onChange={e => handleCredentialChange(field.name, e.target.value)} autoComplete="new-password" />
                                 </div>
                             ))
                         }
                     </div>
                     <DialogFooter>
                         <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                         <Button onClick={handleUpdateCredentials} disabled={updateCredentialsMutation.isPending}>{updateCredentialsMutation.isPending ? "Saving..." : "Save"}</Button>
                     </DialogFooter>
                 </DialogContent>
            </Dialog>
        </div>
    );
}
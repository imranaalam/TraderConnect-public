import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Exchange, Broker, connectionRequestSchema, connectionTestSchema, ConnectionRequest, ConnectionTest } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BoltIcon, UserIcon, ClipboardCheckIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { useState, useEffect } from "react";

// Form Schema
const formSchema = z.object({
  marketType: z.string().min(1, "Market type is required"),
  exchangeId: z.string().min(1, "Exchange is required"),
  exchangeType: z.enum(["spot", "futures"]),
  brokerId: z.string().optional(),
  authMethod: z.enum(["api", "credentials"]),
  // API auth fields
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  // Credential auth fields
  username: z.string().optional(),
  password: z.string().optional(),
  accountNumber: z.string().optional(),
  pin: z.string().optional(),
}).refine(data => {
  if (data.authMethod === "api") {
    return !!data.apiKey && !!data.apiSecret;
  }
  return true;
}, {
  message: "API key and secret are required for API authentication",
  path: ["apiKey"],
}).refine(data => {
  if (data.authMethod === "credentials") {
    return !!data.username && !!data.password;
  }
  return true;
}, {
  message: "Username and password are required for credentials authentication",
  path: ["username"],
});

type FormValues = z.infer<typeof formSchema>;

export default function ExchangeConnectPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [selectedMarketType, setSelectedMarketType] = useState<string>("");
  const [selectedExchangeId, setSelectedExchangeId] = useState<string>("");
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'not_tested' | 'testing' | 'success' | 'failed'>('not_tested');
  const [testError, setTestError] = useState<string | null>(null);

  // Fetch all exchanges
  const { data: exchanges, isLoading: exchangesLoading } = useQuery<Exchange[]>({
    queryKey: ["/api/exchanges"],
  });

  // Fetch filtered exchanges by market type
  const { data: filteredExchanges, isLoading: filteredExchangesLoading } = useQuery<Exchange[]>({
    queryKey: ["/api/exchanges", selectedMarketType],
    enabled: !!selectedMarketType,
  });

  // Fetch brokers for the selected exchange
  const { data: brokers, isLoading: brokersLoading } = useQuery<Broker[]>({
    queryKey: ["/api/brokers", selectedExchangeId],
    queryFn: () => fetch(`/api/brokers/${selectedExchangeId}`).then(res => {
      if (!res.ok) throw new Error('Failed to load brokers');
      return res.json();
    }),
    enabled: !!selectedExchangeId,
  });

  // Create connection mutation
  const connectionMutation = useMutation({
    mutationFn: async (data: ConnectionRequest) => {
      const res = await apiRequest("POST", "/api/connections", data);
      return await res.json();
    },
    onSuccess: (connection) => {
      // Make sure to fully invalidate the connections query cache
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });

      toast({
        title: "Connection successful",
        description: "You have successfully connected to the exchange",
      });

      // Short delay to ensure query invalidation completes before redirecting
      setTimeout(() => {
        setLocation(`/dashboard/${connection.id}`);
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (data: ConnectionTest) => {
      const res = await apiRequest("POST", "/api/test-connection", data);
      return res.json();
    },
    onSuccess: () => {
      setConnectionStatus('success');
      setTestError(null);
      toast({
        title: "Connection test successful",
        description: "Your credentials were verified successfully",
      });
      window.location.href = '/'; // Redirect after successful test
    },
    onError: (error: any) => {
      setConnectionStatus('failed');
      setTestError(error.message || "Connection test failed");
      toast({
        title: "Connection test failed",
        description: error.message || "Failed to verify your credentials",
        variant: "destructive",
      });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      marketType: "",
      exchangeId: "",
      exchangeType: "spot",
      brokerId: "",
      authMethod: "api",
      apiKey: "",
      apiSecret: "",
      username: "",
      password: "",
      accountNumber: "",
      pin: "",
    },
  });

  // Update exchange options when market type changes
  useEffect(() => {
    if (selectedMarketType) {
      form.setValue("exchangeId", "");
      setSelectedExchangeId("");
      setSelectedExchange(null);
      form.setValue("brokerId", "");
    }
  }, [selectedMarketType, form]);

  // Update broker and exchange options when exchange changes
  useEffect(() => {
    if (selectedExchangeId && exchanges) {
      const exchange = exchanges.find(e => e.id.toString() === selectedExchangeId);
      setSelectedExchange(exchange || null);
      form.setValue("brokerId", "");
    }
  }, [selectedExchangeId, exchanges, form]);

  // Helper function to prepare connection data
  function prepareConnectionData(data: FormValues): { credentials: Record<string, string>, connectionData: ConnectionRequest } {
    // Prepare credentials object based on auth method
    let credentials = {};

    if (data.authMethod === "api") {
      credentials = {
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
      };
    } else {
      credentials = {
        username: data.username,
        password: data.password,
        ...(data.accountNumber && { accountNumber: data.accountNumber }),
        ...(data.pin && { pin: data.pin }),
      };
    }

    // Create connection request
    const connectionData: ConnectionRequest = {
      exchangeId: parseInt(data.exchangeId),
      brokerId: data.brokerId && data.brokerId !== "direct_connection" ? parseInt(data.brokerId) : undefined,
      authMethod: data.authMethod,
      credentials,
    };

    return { credentials, connectionData };
  }

  function testConnection() {
    const formData = form.getValues();
    const isValid = form.trigger();

    if (!isValid) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields correctly",
        variant: "destructive",
      });
      return;
    }

    const { connectionData } = prepareConnectionData(formData);
    setConnectionStatus('testing');
    testConnectionMutation.mutate(connectionData as ConnectionTest);
  }

  async function onSubmit(data: FormValues) {
    try {
      setConnectionStatus('testing');
      const { connectionData } = prepareConnectionData(data);
      
      // First test the connection
      await testConnectionMutation.mutateAsync(connectionData);
      
      // If test succeeds, save the connection
      connectionMutation.mutate(connectionData);
      
    } catch (error: any) {
      setConnectionStatus('failed');
      toast({
        title: "Connection test failed",
        description: error.message || "Failed to verify your credentials",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mt-8">
      <div className="md:grid md:grid-cols-3 md:gap-6">
        {/* Left Section */}
        <div className="md:col-span-1">
          <div className="px-4 sm:px-0">
            <h3 className="text-lg font-medium leading-6 text-neutral-900">Exchange Connection</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Connect to your preferred trading exchange or broker to begin trading.
            </p>
            <div className="mt-4">
              <div className="my-4 border border-neutral-200 rounded-md p-4 bg-neutral-50">
                <h4 className="text-sm font-medium text-neutral-900 mb-2">Connection Status</h4>
                <div className="flex items-center text-sm text-neutral-700">
                  {connectionStatus === 'not_tested' && (
                    <>
                      <span className="h-3 w-3 bg-neutral-300 rounded-full mr-2"></span>
                      <span>Not tested</span>
                    </>
                  )}
                  {connectionStatus === 'testing' && (
                    <>
                      <span className="h-3 w-3 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                      <span>Testing connection...</span>
                    </>
                  )}
                  {connectionStatus === 'success' && (
                    <>
                      <CheckCircle2Icon className="h-4 w-4 text-green-500 mr-2" />
                      <span className="text-green-600">Connection verified</span>
                    </>
                  )}
                  {connectionStatus === 'failed' && (
                    <>
                      <XCircleIcon className="h-4 w-4 text-red-500 mr-2" />
                      <span className="text-red-600">Connection failed</span>
                    </>
                  )}
                </div>
                {connectionStatus === 'failed' && testError && (
                  <div className="mt-2 text-xs text-red-500">
                    {testError}
                  </div>
                )}
              </div>

              <div className="space-y-4 mt-6">
                <div className="flex items-center text-sm text-neutral-700">
                  <BoltIcon className="h-5 w-5 text-primary mr-2" />
                  <span>Fast API connections</span>
                </div>
                <div className="flex items-center text-sm text-neutral-700">
                  <ClipboardCheckIcon className="h-5 w-5 text-primary mr-2" />
                  <span>Multiple account support</span>
                </div>
                <div className="flex items-center text-sm text-neutral-700">
                  <UserIcon className="h-5 w-5 text-primary mr-2" />
                  <span>Secure credential handling</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Connection Form */}
        <div className="mt-5 md:mt-0 md:col-span-2">
          <Card>
            <CardContent className="pt-6 auth-form-container">
              <div>
                <h2 className="text-xl font-medium text-neutral-900 mb-6">Connect to Exchange or Broker</h2>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Market Type Selection */}
                    <FormField
                      control={form.control}
                      name="marketType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Market Type</FormLabel>
                          <Select 
                            onValueChange={(value) => {
                              field.onChange(value);
                              setSelectedMarketType(value);
                            }} 
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select market type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="equity">Equity</SelectItem>
                              <SelectItem value="crypto">Cryptocurrency</SelectItem>
                              <SelectItem value="forex">Forex</SelectItem>
                              <SelectItem value="commodity">Commodities</SelectItem>
                              <SelectItem value="metals">Metals</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Exchange Selection */}
                    <FormField
                      control={form.control}
                      name="exchangeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exchange</FormLabel>
                          <Select 
                            onValueChange={(value) => {
                              field.onChange(value);
                              setSelectedExchangeId(value);
                            }} 
                            value={field.value}
                            disabled={!selectedMarketType || filteredExchangesLoading}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an exchange" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredExchanges?.map((exchange) => (
                                <SelectItem key={exchange.id} value={exchange.id.toString()}>
                                  {exchange.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Exchange Type - hidden since the exchange will determine this */}

                    {/* Broker Selection */}
                    {selectedExchange && (
                      <FormField
                        control={form.control}
                        name="brokerId"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex justify-between">
                              <FormLabel>Broker</FormLabel>
                              {!selectedExchange.requiresBroker && (
                                <span className="text-xs text-neutral-500">Optional - direct exchange connection available</span>
                              )}
                              {selectedExchange.requiresBroker && (
                                <span className="text-xs text-orange-500 font-medium">Required for this exchange</span>
                              )}
                            </div>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                              disabled={brokersLoading || !brokers?.length}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={brokers?.length ? "Select a broker" : "No brokers available"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {!selectedExchange.requiresBroker && (
                                  <SelectItem value="direct_connection">None (Direct Connection)</SelectItem>
                                )}
                                {brokers?.map((broker) => (
                                  <SelectItem key={broker.id} value={broker.id.toString()}>
                                    {broker.name}
                                  </SelectItem>
                                ))}
                                {brokers?.length === 0 && (
                                  <div className="p-2 text-sm text-neutral-500">No brokers available for this exchange</div>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Authentication Method */}
                    <div className="border-t border-neutral-200 pt-4">
                      <h3 className="text-sm font-medium text-neutral-900 mb-3">Authentication Method</h3>

                      <FormField
                        control={form.control}
                        name="authMethod"
                        render={({ field }) => {
                          // Determine available auth methods based on broker or exchange
                          const selectedBrokerId = form.watch("brokerId");
                          const selectedBroker = selectedBrokerId ? brokers?.find(b => b.id.toString() === selectedBrokerId) : null;

                          // Use broker's auth methods if available, otherwise use default options
                          const authMethods = selectedBroker?.authMethods || ['api', 'credentials'];
                          const showApiOption = authMethods.includes('api');
                          const showCredentialsOption = authMethods.includes('credentials');

                          // If current selected auth method isn't supported by this broker, switch to first available
                          useEffect(() => {
                            if (selectedBroker && authMethods.length > 0 && !authMethods.includes(field.value)) {
                              field.onChange(authMethods[0]);
                            }
                          }, [selectedBrokerId, field, authMethods]);

                          return (
                            <FormItem className="space-y-3">
                              <div className="flex justify-between">
                                <FormLabel>Authentication Method</FormLabel>
                                {selectedBroker && (
                                  <span className="text-xs text-neutral-500">
                                    {selectedBroker.name} supports: {authMethods.join(', ')}
                                  </span>
                                )}
                              </div>
                              <FormControl>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  className="flex space-x-4 mb-4"
                                >
                                  {showApiOption && (
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                      <FormControl>
                                        <RadioGroupItem value="api" />
                                      </FormControl>
                                      <FormLabel className="font-normal cursor-pointer">
                                        API Keys
                                      </FormLabel>
                                    </FormItem>
                                  )}
                                  {showCredentialsOption && (
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                      <FormControl>
                                        <RadioGroupItem value="credentials" />
                                      </FormControl>
                                      <FormLabel className="font-normal cursor-pointer">
                                        Credentials
                                      </FormLabel>
                                    </FormItem>
                                  )}
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />

                      {/* API Authentication Fields */}
                      {form.watch("authMethod") === "api" && (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="apiKey"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>API Key</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter your API key" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="apiSecret"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>API Secret</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter your API secret" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {/* Credentials Authentication Fields */}
                      {form.watch("authMethod") === "credentials" && (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter your username" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter your password" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="accountNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Account Number (optional)</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter your account number" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="pin"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>PIN (optional)</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter your PIN" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex">
                      <Button 
                        type="submit" 
                        className="flex-1" 
                        disabled={connectionMutation.isPending}
                      >
                        {connectionMutation.isPending ? "Connecting..." : "Save Connection"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FetchResult, AccountDetailsResponse } from "@shared/schema";
import { RefreshCw, BarChart3, ListFilter, Key, Info, AlertTriangle } from "lucide-react";
import { DataTableAccordion } from "./DataTableAccordion";

interface AccountDetailsProps {
  accountDetails?: AccountDetailsResponse;
  error?: Error | null;
  isFetching: boolean;
  isInitialLoading: boolean;
  onRefresh: () => void;
}

export function AccountDetails({
  accountDetails,
  error: accountDetailsError,
  isFetching,
  isInitialLoading,
  onRefresh
}: AccountDetailsProps) {
  const accountDetailsAuthFailed = accountDetails?.dataSource === "error_auth";
  const accountDetailsFetchFailed = !!accountDetailsError || accountDetails?.dataSource === "error";
  const accountDetailsPartialError = accountDetails?.dataSource === "partial_error";

  const hasValidData = (result?: FetchResult) =>
    result && !result.isErrorState && result.data && result.data.length > 0;

  const hasPositionsData = hasValidData(accountDetails?.positions);
  const hasOrderHistoryData = hasValidData(accountDetails?.orderHistory);
  const hasTradingAccountsData = hasValidData(accountDetails?.tradingAccounts);
  const hasAccountStatementData = hasValidData(accountDetails?.accountStatement);
  const hasAccountInfoData = hasValidData(accountDetails?.accountInfo);

  const anyDetailsDataPresent = accountDetails &&
    !accountDetailsFetchFailed &&
    !accountDetailsAuthFailed &&
    ((accountDetails.tradingAccounts?.data?.length ?? 0) > 0 ||
      (accountDetails.orderHistory?.data?.length ?? 0) > 0 ||
      (accountDetails.positions?.data?.length ?? 0) > 0 ||
      (accountDetails.accountStatement?.data?.length ?? 0) > 0 ||
      (accountDetails.accountInfo?.data?.length ?? 0) > 0);

  const defaultAccountDetailsTabValue = hasPositionsData
    ? "portfolio"
    : hasOrderHistoryData
      ? "orders"
      : hasTradingAccountsData ||
        hasAccountStatementData ||
        hasAccountInfoData
        ? "accounts"
        : "portfolio";

  if (isInitialLoading) {
    return <div>Loading...</div>;
  }

  return (
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
            variant="outline"
            onClick={onRefresh}
            disabled={isFetching}
          >
            {isFetching ? (
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
        {accountDetailsAuthFailed && (
          <Card className="border border-red-200 bg-red-50 mt-4">
            <CardContent className="pt-6">
              <div className="flex items-center text-red-800">
                <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                <p>
                  Authentication failed. Cannot retrieve account details.
                  {accountDetails?.message ? ` (Details: ${accountDetails.message})` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {accountDetailsFetchFailed && (
          <Card className="border border-yellow-200 bg-yellow-50 mt-4">
            <CardContent className="pt-6">
              <div className="flex items-center text-yellow-800">
                <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                <p>
                  Failed to load account details.
                  {accountDetailsError?.message || accountDetails?.message || "Please try refreshing."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {accountDetailsPartialError && (
          <Card className="border border-orange-200 bg-orange-50 mt-4">
            <CardContent className="pt-6">
              <div className="flex items-center text-orange-800">
                <Info className="h-5 w-5 mr-2 flex-shrink-0" />
                <p>
                  Could not load all account details. Some sections might be unavailable or show errors below.
                  {accountDetails?.message ? ` (Details: ${accountDetails.message})` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isInitialLoading && !accountDetailsAuthFailed && !accountDetailsFetchFailed && (
          anyDetailsDataPresent ? (
            <Tabs defaultValue={defaultAccountDetailsTabValue} className="w-full mt-4">
              <TabsList className="w-full justify-start border-b pb-0 mb-4 overflow-x-auto">
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

              {accountDetails?.positions && (
                <TabsContent value="portfolio" className="mt-2">
                  <DataTableAccordion
                    title="Portfolio Positions"
                    fetchResult={accountDetails.positions}
                    isLoading={isFetching && !accountDetails.positions}
                    error={accountDetails.positions?.errorMessage}
                    defaultOpen={true}
                  />
                </TabsContent>
              )}

              {accountDetails?.orderHistory && (
                <TabsContent value="orders" className="mt-2">
                  <DataTableAccordion
                    title="Order History"
                    fetchResult={accountDetails.orderHistory}
                    isLoading={isFetching && !accountDetails.orderHistory}
                    error={accountDetails.orderHistory?.errorMessage}
                    defaultOpen={defaultAccountDetailsTabValue === "orders"}
                  />
                </TabsContent>
              )}

              {(accountDetails?.tradingAccounts ||
                accountDetails?.accountStatement ||
                accountDetails?.accountInfo) && (
                <TabsContent value="accounts" className="mt-2 space-y-4">
                  {accountDetails?.tradingAccounts && (
                    <DataTableAccordion
                      title="Trading Accounts"
                      fetchResult={accountDetails.tradingAccounts}
                      isLoading={isFetching && !accountDetails.tradingAccounts}
                      error={accountDetails.tradingAccounts?.errorMessage}
                      defaultOpen={true}
                    />
                  )}
                  {accountDetails?.accountInfo && (
                    <DataTableAccordion
                      title="Account Info Summary"
                      fetchResult={accountDetails.accountInfo}
                      isLoading={isFetching && !accountDetails.accountInfo}
                      error={accountDetails.accountInfo?.errorMessage}
                      maxHeight="300px"
                    />
                  )}
                  {accountDetails?.accountStatement && (
                    <DataTableAccordion
                      title="Account Statement"
                      fetchResult={accountDetails.accountStatement}
                      isLoading={isFetching && !accountDetails.accountStatement}
                      error={accountDetails.accountStatement?.errorMessage}
                    />
                  )}
                </TabsContent>
              )}
            </Tabs>
          ) : (
            <div className="text-center py-10 mt-4">
              <p className="text-neutral-500">
                No detailed account information found for this connection.
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

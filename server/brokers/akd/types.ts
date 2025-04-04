
export interface FetchResult {
  headers: string[];
  data: string[][];
}

export interface AccountDetailsResponse {
  tradingAccounts: FetchResult;
  orderHistory: FetchResult;
  positions: FetchResult;
  accountInfo: FetchResult;
  accountStatement: FetchResult;
  timestamp: string;
  dataSource: 'api' | 'error' | 'error_auth' | 'partial_error';
  message?: string;
}

export interface AKDClientConfig {
  wsdlUrl?: string;
  serviceUsername?: string;
  servicePassword?: string;
}

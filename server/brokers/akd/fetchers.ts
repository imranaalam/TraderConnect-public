
import { Client } from 'soap';
import { FetchResult } from './types';
import { processAndUnzipResponse, parseResponseToStructure, KEY_MAPPINGS } from './utils';

const COMMON_START_DATE = "Mar 01, 2025";
const COMMON_END_DATE = "Mar 12, 2025";
const DEFAULT_ACCOUNT_FALLBACK = "AUTH_FAILED";

export async function getTradingAccounts(
  client: Client,
  traderId: string
): Promise<{ result: FetchResult; primaryAccount: string }> {
  const params = { userName: traderId };
  const result = await client.TradAccountsAsync(params);
  const processed = await processAndUnzipResponse("TradAccounts", result);
  const parsed = parseResponseToStructure("TradAccounts", processed, KEY_MAPPINGS.TradAccounts);

  const primaryAccount = parsed[0]?.AccountCode || DEFAULT_ACCOUNT_FALLBACK;
  return {
    result: {
      headers: KEY_MAPPINGS.TradAccounts,
      data: parsed.map(row => Object.values(row))
    },
    primaryAccount
  };
}

export async function getOrderHistory(
  client: Client,
  traderId: string,
  accountNo: string,
  startDate: string = COMMON_START_DATE,
  endDate: string = COMMON_END_DATE
): Promise<FetchResult> {
  const params = { userName: traderId, startDate, endDate, accountNo };
  const result = await client.GetOrderHistoryAsync(params);
  const processed = await processAndUnzipResponse("GetOrderHistory", result);
  const parsed = parseResponseToStructure("GetOrderHistory", processed, KEY_MAPPINGS.GetOrderHistory);

  return {
    headers: KEY_MAPPINGS.GetOrderHistory,
    data: parsed.map(row => Object.values(row))
  };
}

export async function getPositions(
  client: Client,
  traderId: string,
  accountNo: string
): Promise<FetchResult> {
  const params = { userName: traderId, accountNo };
  const result = await client.GetCollateralAsync(params);
  const processed = await processAndUnzipResponse("GetCollateral", result);
  const parsed = parseResponseToStructure("GetCollateral", processed, KEY_MAPPINGS.GetCollateral);

  return {
    headers: KEY_MAPPINGS.GetCollateral,
    data: parsed.map(row => Object.values(row))
  };
}

export async function getAccountInfo(
  client: Client,
  traderId: string,
  accountNo: string
): Promise<FetchResult> {
  const params = { userName: traderId, accountNo };
  const result = await client.GetExposureDynamicAsync(params);
  const processed = await processAndUnzipResponse("GetExposureDynamic", result);
  const parsed = parseResponseToStructure("GetExposureDynamic", processed);

  return {
    headers: ["Detail", "Value"],
    data: parsed.map(row => Object.values(row))
  };
}

export async function getAccountStatement(
  client: Client,
  traderId: string,
  accountNo: string,
  startDate: string = COMMON_START_DATE,
  endDate: string = COMMON_END_DATE
): Promise<FetchResult> {
  const params = { userName: traderId, startDate, endDate, accountNo };
  const result = await client.GetAccountStatementAsync(params);
  const processed = await processAndUnzipResponse("GetAccountStatement", result);
  const parsed = parseResponseToStructure("GetAccountStatement", processed, KEY_MAPPINGS.GetAccountStatement);

  return {
    headers: KEY_MAPPINGS.GetAccountStatement,
    data: parsed.map(row => Object.values(row))
  };
}

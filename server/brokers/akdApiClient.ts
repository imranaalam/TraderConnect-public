// server/brokers/akdApiClient.ts
import * as soap from "soap";
import * as zlib from "zlib";
import { promisify } from "util";
import { Buffer } from "buffer"; // Ensure Buffer is explicitly imported
import { createClientAsync } from 'soap';
import { AccountDetailsResponse, AKDClientConfig } from './akd/types';
import { getTradingAccounts, getOrderHistory, getPositions, getAccountInfo, getAccountStatement } from './akd/fetchers';

// Promisify zlib functions for async/await usage
const gunzipAsync = promisify(zlib.gunzip);

// ============================
// Configuration (Use Environment Variables ideally)
// ============================
const WSDL_URL =
    process.env.AKD_WSDL_URL ||
    "http://online.akdtrade.biz/TradeCastService/LoginServerService?wsdl";

// --- SERVICE Credentials (For HTTP Basic Auth - like Python's myservice/12345678) ---
const SERVICE_USERNAME = process.env.AKD_SERVICE_USER || "myservice";
const SERVICE_PASSWORD = process.env.AKD_SERVICE_PASSWORD || "12345678";
// --- End SERVICE Credentials ---

const COMMON_START_DATE = "Mar 01, 2025"; // From example
const COMMON_END_DATE = "Mar 12, 2025"; // From example
const DEFAULT_ACCOUNT_FALLBACK = "AUTH_FAILED"; // Specific marker for auth failure

// ============================
// Key Mappings for API Responses (Aligned with Python)
// ============================
const KEY_MAPPINGS: Record<string, string[]> = {
    TradAccounts: [
        "AccountCode",
        "AccountTitle",
        "BranchCode",
        "TraderCode",
        "AccountStatus",
        "NIC",
    ],
    GetOrderHistory: [
        "Symbol",
        "Quantity",
        "Rate",
        "Amount",
        "Side",
        "OrderType",
        "OrderDate",
        "TradeDate",
        "Reference",
    ],
    GetAccountStatement: [
        "VoucherNo",
        "UnknownCol2",
        "Date",
        "Description",
        "Debit",
        "Credit",
        "Balance",
    ],
    GetCollateral: [
        "Symbol",
        "Quantity",
        "TotalQty",
        "AvgBuyRate",
        "SoldQuantity",
        "AvgSellRate",
        "MTM_Rate",
        "MTMAmount",
        "HaircutPercent",
        "MarginizedValueRate",
        "ValueAfterHaircut",
        "PendingSellQty",
        "SettledPL",
        "UnsettledPL",
    ],
    // GetExposureDynamic uses a special parser, no direct mapping here
};

// ============================
// Helper Functions (FIXED processAndUnzipResponse & Enhanced Logging)
// ============================

/**
 * Processes the raw SOAP response, handling potential Buffers, Gzip, and Base64.
 * FIXED: Only Base64 decode if it looks like Base64 and only Gzip if magic number matches.
 */
async function processAndUnzipResponse(
    apiMethod: string,
    rawSoapResult: any,
): Promise<string | null> {
    console.log(
        `[${apiMethod}] processAndUnzipResponse received rawSoapResult:`,
        JSON.stringify(rawSoapResult, null, 2),
    );

    // Attempt to extract the core response data
    let resp =
        rawSoapResult?.[0]?.return ??
        rawSoapResult?.[0]?.[`${apiMethod}Result`] ??
        rawSoapResult?.[0] ??
        rawSoapResult;

    if (resp && typeof resp === "object" && resp.return) {
        resp = resp.return;
    }

    console.log(`[${apiMethod}] Extracted response part for processing:`, resp);

    if (resp === null || resp === undefined) {
        console.log(
            `[${apiMethod}] Extracted response part is null or undefined.`,
        );
        return null;
    }

    try {
        if (Buffer.isBuffer(resp)) {
            console.log(`[${apiMethod}] Response is a Buffer.`);
            if (resp[0] === 0x1f && resp[1] === 0x8b) {
                // Gzip magic number
                console.log(
                    `[${apiMethod}] Buffer is Gzipped. Decompressing...`,
                );
                const decompressed = await gunzipAsync(resp);
                const decodedString = decompressed.toString("utf-8");
                console.log(
                    `[${apiMethod}] Decompressed string (from Buffer):`,
                    decodedString,
                );
                return decodedString;
            } else {
                console.log(
                    `[${apiMethod}] Buffer is not Gzipped. Decoding as UTF-8...`,
                );
                const decodedString = resp.toString("utf-8");
                console.log(
                    `[${apiMethod}] Decoded string (from Buffer):`,
                    decodedString,
                );
                return decodedString;
            }
        } else if (typeof resp === "string") {
            console.log(`[${apiMethod}] Response is a string.`);

            // --- START FIX ---
            // Heuristic: Does it look like Base64?
            const likelyBase64 =
                /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                    resp,
                ) && resp.length > 20; // More strict Base64 check

            if (likelyBase64) {
                console.log(
                    `[${apiMethod}] String looks like Base64. Attempting decode...`,
                );
                try {
                    const decodedBuffer = Buffer.from(resp, "base64");
                    console.log(
                        `[${apiMethod}] Base64 decode successful. Checking for Gzip...`,
                    );
                    if (
                        decodedBuffer[0] === 0x1f &&
                        decodedBuffer[1] === 0x8b
                    ) {
                        console.log(
                            `[${apiMethod}] Decoded buffer is Gzipped. Decompressing...`,
                        );
                        const decompressed = await gunzipAsync(decodedBuffer);
                        const decodedString = decompressed.toString("utf-8");
                        console.log(
                            `[${apiMethod}] Decompressed string (from Base64->Gzip):`,
                            decodedString,
                        );
                        return decodedString;
                    } else {
                        console.log(
                            `[${apiMethod}] Decoded buffer is not Gzipped. Returning decoded string...`,
                        );
                        const decodedString = decodedBuffer.toString("utf-8");
                        console.log(
                            `[${apiMethod}] Decoded (but not Gzipped) string:`,
                            decodedString,
                        );
                        // Check if the decoded string is likely the intended result (e.g., "Not Authorized") or still garbled
                        if (
                            decodedString.includes(";") ||
                            decodedString.includes("|") ||
                            decodedString.toLowerCase() === "not authorized"
                        ) {
                            return decodedString;
                        } else if (decodedString.includes("\uFFFD")) {
                            // Check for Unicode replacement character (often indicates decoding issues)
                            console.warn(
                                `[${apiMethod}] Base64 decoded string contains replacement characters. Reverting to original string.`,
                            );
                            return resp;
                        } else {
                            // Decoded but doesn't look like expected data or known error, cautiously return original.
                            console.warn(
                                `[${apiMethod}] Base64 decoded string doesn't look like pipe/semicolon data or known error. Reverting to original string.`,
                            );
                            return resp;
                        }
                    }
                } catch (base64Error) {
                    console.log(
                        `[${apiMethod}] Base64 decode failed. Assuming plain string.`,
                    );
                    return resp;
                }
            } else {
                console.log(
                    `[${apiMethod}] String does not look like Base64. Treating as plain text.`,
                );
                return resp;
            }
            // --- END FIX ---
        } else {
            console.log(
                `[${apiMethod}] Response is neither Buffer nor string. Converting to string...`,
            );
            const stringified = String(resp);
            console.log(`[${apiMethod}] Stringified response:`, stringified);
            return stringified;
        }
    } catch (error: any) {
        console.error(
            `[${apiMethod}] Error during response processing/decompression: ${error.message}. Raw resp part: ${resp}`,
        );
        return String(resp);
    }
}

/** Cleans a string for use as a JSON key */
function cleanKey(keyStr: string | null | undefined): string {
    if (!keyStr) return "Unnamed_Key";
    const cleaned = keyStr.replace(/[^\w\- ]/g, "").trim(); // Allow word chars, hyphen, space
    const finalKey = cleaned.replace(/\s+/g, "_"); // Replace spaces/tabs etc. with underscore
    return finalKey || "Invalid_Key"; // Handle cases where key becomes empty
}

/** Parses pipe/semicolon delimited string to structured array */
function parseResponseToStructure(
    apiMethod: string,
    responseStr: string | null,
    keyMapping?: string[],
): Record<string, any>[] {
    console.log(
        `[${apiMethod}] parseResponseToStructure received string:`,
        responseStr ? `"${responseStr.substring(0, 150)}..."` : "null",
    ); // Log more context
    if (!responseStr || !responseStr.trim()) {
        console.log(`[${apiMethod}] Input string is null or empty.`);
        return [];
    }
    const lowerStripped = responseStr.trim().toLowerCase();
    // Check for known "no data" or error strings
    if (
        lowerStripped.includes("no record") ||
        lowerStripped.includes("no data") ||
        lowerStripped === "not authorized"
    ) {
        console.log(
            `[${apiMethod}] Detected 'no data' or 'not authorized' in response string.`,
        );
        if (lowerStripped === "not authorized" && keyMapping) {
            const errorObj: Record<string, any> = {};
            errorObj[keyMapping[0] || "Error"] = "Not Authorized";
            for (let i = 1; i < keyMapping.length; i++) {
                errorObj[keyMapping[i]] = null;
            }
            console.log(
                `[${apiMethod}] Returning structured auth error object.`,
            );
            return [errorObj];
        }
        return []; // Return empty for general "no data"
    }

    try {
        const rows = responseStr
            .trim()
            .split("|")
            .map((r) => r.trim())
            .filter((r) => r);
        if (!rows.length) {
            console.log(
                `[${apiMethod}] No rows after splitting response by '|'.`,
            );
            return [];
        }
        console.log(`[${apiMethod}] Found ${rows.length} rows.`);

        let headersToUse: string[] | undefined = keyMapping;
        let dataRowsStr: string[] = rows;

        // --- Header Logic ---
        if (!headersToUse) {
            console.log(
                `[${apiMethod}] No key mapping provided. Attempting to parse headers from first row...`,
            );
            if (rows.length >= 1) {
                // Check if there's at least one row to parse headers from
                const firstRowCols = rows[0].split(";");
                // Refined Header Check: Does the first column of the *second* row look different from the first column of the *first* row?
                // This helps differentiate actual headers from single-row data or multi-row data without headers.
                let hasHeaderRow = false;
                if (rows.length > 1) {
                    const secondRowCols = rows[1].split(";");
                    if (
                        firstRowCols.length === secondRowCols.length &&
                        firstRowCols[0] !== secondRowCols[0]
                    ) {
                        hasHeaderRow = true; // Likely a header row if first cell differs and counts match
                    }
                }

                // Also check using the previous character type logic as a fallback
                const firstRowLooksLikeHeader = firstRowCols.some(
                    (h) =>
                        /[a-zA-Z]/.test(h.trim()) &&
                        !/^\d+(\.\d+)?$/.test(h.trim()),
                );

                if (
                    hasHeaderRow ||
                    (rows.length > 1 && firstRowLooksLikeHeader)
                ) {
                    headersToUse = firstRowCols.map((h) => cleanKey(h.trim()));
                    dataRowsStr = rows.slice(1); // Use rows after the first
                    console.log(
                        `[${apiMethod}] Determined first row is header. Parsed headers: [${headersToUse.join(", ")}]`,
                    );
                    // Handle duplicates
                    const usedCounts: Record<string, number> = {};
                    const finalHeaders: string[] = [];
                    for (const h of headersToUse) {
                        const count = (usedCounts[h] || 0) + 1;
                        usedCounts[h] = count;
                        finalHeaders.push(count === 1 ? h : `${h}_${count}`);
                    }
                    headersToUse = finalHeaders;
                    console.log(
                        `[${apiMethod}] Final unique headers: [${headersToUse.join(", ")}]`,
                    );
                } else {
                    // Assume no header row (either single row, or multi-row data)
                    const numCols = firstRowCols.length;
                    headersToUse = Array(numCols)
                        .fill(0)
                        .map((_, i) => `Col${i + 1}`);
                    dataRowsStr = rows; // Use all rows as data
                    console.log(
                        `[${apiMethod}] Assuming no header row. Using generic headers: [${headersToUse.join(", ")}]`,
                    );
                }
            } else {
                console.log(
                    `[${apiMethod}] Not enough rows to determine headers without mapping.`,
                );
                return [];
            }
        } else {
            console.log(
                `[${apiMethod}] Using provided key mapping: [${headersToUse.join(", ")}]`,
            );
        }
        // --- End Header Logic ---

        if (!headersToUse || headersToUse.length === 0) {
            console.warn(
                `[${apiMethod}] Warning: Could not determine headers for response.`,
            );
            return dataRowsStr.map((r) => ({ raw_row: r }));
        }

        const structuredData: Record<string, any>[] = [];
        const numHeaders = headersToUse.length;
        console.log(
            `[${apiMethod}] Processing ${dataRowsStr.length} data rows with ${numHeaders} headers...`,
        );
        for (const rowStr of dataRowsStr) {
            const cols = rowStr.split(";").map((c) => c.trim());
            // Pad / Truncate more robustly
            const finalCols = Array(numHeaders).fill(null);
            for (let i = 0; i < numHeaders; i++) {
                if (i < cols.length) {
                    finalCols[i] = cols[i] === "null" ? null : cols[i]; // Handle 'null' string
                }
            }

            const rowDict: Record<string, any> = {};
            for (let i = 0; i < numHeaders; i++) {
                rowDict[headersToUse[i]] = finalCols[i];
            }
            structuredData.push(rowDict);
        }
        console.log(
            `[${apiMethod}] Finished parsing. Result length: ${structuredData.length}`,
        );
        return structuredData;
    } catch (error: any) {
        console.error(
            `[${apiMethod}] Error parsing response string into structure: ${error.message}`,
        );
        return [{ error: "Parsing failed", raw_response: responseStr }];
    }
}

/** Specialized parser for GetExposureDynamic */
function parseExposureDynamic(
    apiMethod: string,
    responseStr: string | null,
): Record<string, any>[] {
    console.log(
        `[${apiMethod}] parseExposureDynamic received string:`,
        responseStr ? `"${responseStr.substring(0, 150)}..."` : "null",
    );
    if (!responseStr || !responseStr.trim()) {
        return [];
    }
    const lowerStripped = responseStr.trim().toLowerCase();
    if (
        lowerStripped.includes("no record") ||
        lowerStripped.includes("no data") ||
        lowerStripped === "not authorized"
    ) {
        console.log(
            `[${apiMethod}] Detected 'no data' or 'not authorized' in response string.`,
        );
        if (lowerStripped === "not authorized") {
            return [{ Metric: "Error", Error: "Not Authorized" }];
        }
        return [];
    }

    try {
        const rows = responseStr
            .trim()
            .split("|")
            .map((r) => r.trim())
            .filter((r) => r);
        console.log(
            `[${apiMethod}] Found ${rows.length} rows for exposure parsing.`,
        );
        if (rows.length < 2) {
            console.warn(
                `[${apiMethod}] Not enough rows for specific parsing. Falling back.`,
            );
            return parseResponseToStructure(apiMethod, responseStr);
        }

        const marketHeadersRaw = rows[0].split(";").map((h) => h.trim());
        // More robust check for header row
        if (
            !marketHeadersRaw ||
            !marketHeadersRaw[0] ||
            marketHeadersRaw[0].toLowerCase().trim() !== "market name"
        ) {
            console.warn(
                `[${apiMethod}] Unexpected header format (First cell: "${marketHeadersRaw[0]}"). Falling back.`,
            );
            return parseResponseToStructure(apiMethod, responseStr);
        }

        const marketKeys = marketHeadersRaw.slice(1).map((mh) => cleanKey(mh));
        console.log(`[${apiMethod}] Market keys: [${marketKeys.join(", ")}]`);
        const structuredData: Record<string, any>[] = [];

        console.log(
            `[${apiMethod}] Processing ${rows.length - 1} metric rows...`,
        );
        for (const rowStr of rows.slice(1)) {
            const cols = rowStr.split(";").map((c) => c.trim());
            if (!cols.length) continue;
            const metricNameRaw = cols[0];

            const finalCols = Array(marketKeys.length).fill(null);
            for (let i = 0; i < marketKeys.length; i++) {
                const valIndex = i + 1; // Values start from index 1 in cols array
                if (valIndex < cols.length) {
                    finalCols[i] =
                        cols[valIndex] === "null" ? null : cols[valIndex];
                }
            }

            const rowDict: Record<string, any> = { Metric: metricNameRaw };
            for (let i = 0; i < marketKeys.length; i++) {
                rowDict[marketKeys[i]] = finalCols[i];
            }
            structuredData.push(rowDict);
        }
        console.log(
            `[${apiMethod}] Finished parsing exposure. Result length: ${structuredData.length}`,
        );
        return structuredData;
    } catch (error: any) {
        console.error(
            `[${apiMethod}] Error parsing GetExposureDynamic response: ${error.message}`,
        );
        return [
            {
                error: "GetExposureDynamic parsing failed",
                raw_response: responseStr,
            },
        ];
    }
}

/** Extracts account numbers using specified key */
function extractAccountNumbers(
    structuredData: Record<string, any>[],
    accountKey: string = "AccountCode",
): string[] {
    if (!Array.isArray(structuredData) || structuredData.length === 0) {
        return [];
    }
    const accountNumbers: string[] = [];
    try {
        for (const item of structuredData) {
            if (item && typeof item === "object" && accountKey in item) {
                const accountNum = item[accountKey];
                if (
                    accountNum !== null &&
                    accountNum !== undefined &&
                    String(accountNum).toLowerCase() !== "not authorized"
                ) {
                    accountNumbers.push(String(accountNum).trim());
                }
            }
        }
    } catch (error: any) {
        console.error(
            `Error extracting account numbers using key '${accountKey}': ${error.message}`,
        );
    }
    console.log(
        `Extracted valid account numbers: [${accountNumbers.join(", ")}]`,
    );
    return accountNumbers.filter((acc) => acc); // Filter out empty strings
}

/** Safely convert value to string */
function toStringSafe(value: any): string {
    if (value === null || value === undefined) return "";
    return String(value);
}

// ============================
// Data Fetching Functions (Using Correct Parsing & Auth Handling)
// ============================

interface FetchResult {
    headers: string[];
    data: string[][];
}


const DEFAULT_CONFIG: Required<AKDClientConfig> = {
  wsdlUrl: process.env.AKD_WSDL_URL || "http://online.akdtrade.biz/TradeCastService/LoginServerService?wsdl",
  serviceUsername: process.env.AKD_SERVICE_USER || "myservice",
  servicePassword: process.env.AKD_SERVICE_PASSWORD || "12345678"
};

export class AKDClient {
  private config: Required<AKDClientConfig>;

  constructor(config?: AKDClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async getAllAccountDetails(
    traderUsername: string,
    traderPassword: string
  ): Promise<AccountDetailsResponse> {
    const requestId = Date.now();
    console.log(
        `Fetching AKD details for ${traderUsername}, request ID: ${requestId}`,
    );

    try {
        console.log(
            `Attempting SOAP connection to ${this.config.wsdlUrl} using SERVICE credentials...`,
        );
        console.log(`   Service Username: ${this.config.serviceUsername}`);
        console.log(`   Service Password: ${this.config.servicePassword}`);

        const timestamp = new Date().toISOString();
        const client = await createClientAsync(this.config.wsdlUrl);

        // --- SET SERVICE AUTHENTICATION ---
        client.setSecurity(
            new soap.BasicAuthSecurity(this.config.serviceUsername, this.config.servicePassword),
        );
        console.log("SOAP client created and Service authentication set.");

        // --- Get Data (passing TRADER username) ---
        const { result: tradingAccounts, primaryAccount } =
            await getTradingAccounts(client, traderUsername);

        // --- CRITICAL AUTH CHECK ---
        if (primaryAccount === DEFAULT_ACCOUNT_FALLBACK) {
            console.error(
                `Authentication failed for ${traderUsername} (detected via TradAccounts). Aborting further calls. Request ID: ${requestId}`,
            );
            return {
                tradingAccounts,
                orderHistory: {
                    headers: ["Status"],
                    data: [["Authentication Failed"]],
                },
                positions: {
                    headers: ["Status"],
                    data: [["Authentication Failed"]],
                },
                accountInfo: {
                    headers: ["Status"],
                    data: [["Authentication Failed"]],
                },
                accountStatement: {
                    headers: ["Status"],
                    data: [["Authentication Failed"]],
                },
                timestamp,
                dataSource: "error_auth",
            };
        }
        console.log(
            `Using primary account ${primaryAccount} for subsequent API calls. Request ID: ${requestId}`,
        );

        // Fetch other details IN PARALLEL for potentially faster loading
        const [orderHistory, positions, accountInfo, accountStatement] =
            await Promise.all([
                getOrderHistory(client, traderUsername, primaryAccount),
                getPositions(client, traderUsername, primaryAccount),
                getAccountInfo(client, traderUsername, primaryAccount),
                getAccountStatement(client, traderUsername, primaryAccount),
            ]);

        const dataSource = "api";

        console.log(
            `Successfully fetched API data for ${traderUsername}. Request ID: ${requestId}`,
        );
        // Log structure summary before returning
        console.log(
            `Account details structure: ${JSON.stringify(
                {
                    tradingAccounts: {
                        headers: tradingAccounts.headers,
                        dataLength: tradingAccounts.data.length,
                        sampleRow: tradingAccounts.data[0],
                    },
                    orderHistory: {
                        headers: orderHistory.headers,
                        dataLength: orderHistory.data.length,
                    },
                    positions: {
                        headers: positions.headers,
                        dataLength: positions.data.length,
                    },
                    accountInfo: {
                        headers: accountInfo.headers,
                        dataLength: accountInfo.data.length,
                    },
                    accountStatement: {
                        headers: accountStatement.headers,
                        dataLength: accountStatement.data.length,
                    },
                },
                null,
                2,
            )}`,
        );

        return {
            tradingAccounts,
            orderHistory,
            positions,
            accountInfo,
            accountStatement,
            timestamp,
            dataSource,
        };
    } catch (error: any) {
        console.error(
            `Critical Error in fetchAllAccountDetails for ${traderUsername}: ${error.message}. Request ID: ${requestId}`,
        );
        console.error(error.stack);
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
        }
        const fallbackErrorData = {
            tradingAccounts: {
                headers: ["Error"],
                data: [[`API Failure: ${error.message}`]],
            },
            orderHistory: { headers: ["Error"], data: [[`API Failure`]] },
            positions: { headers: ["Error"], data: [[`API Failure`]] },
            accountInfo: { headers: ["Error"], data: [[`API Failure`]] },
            accountStatement: { headers: ["Error"], data: [[`API Failure`]] },
            timestamp: new Date().toISOString(),
            dataSource: "error",
        };
        return fallbackErrorData;
    }
  }

  async testConnection(
    traderUsername: string,
    traderPassword: string
  ): Promise<boolean> {
    try {
        console.log(
            `Attempting SOAP connection using SERVICE credentials for test...`,
        );
        console.log(`   Service Username: ${this.config.serviceUsername}`);
        console.log(`   Service Password: ${this.config.servicePassword}`);

        const client = await createClientAsync(this.config.wsdlUrl);
        client.setSecurity(
            new soap.BasicAuthSecurity(this.config.serviceUsername, this.config.servicePassword),
        );

        const params = { userName: traderUsername };
        console.log(`Calling TradAccountsAsync for test with params:`, params);
        const result = await client.TradAccountsAsync(params);
        const processed = await processAndUnzipResponse(
            "TradAccounts_Test",
            result,
        );

        if (processed?.toLowerCase() === "not authorized") {
            console.error(
                `AKD connection test FAILED for ${traderUsername}: Service authentication passed, but trader call returned 'Not Authorized'.`,
            );
            return false;
        }
        if (!processed) {
            console.warn(
                `AKD connection test WARNING for ${traderUsername}: Service authentication passed, but trader call returned empty/null.`,
            );
            return true; // Count as success if no explicit error
        }

        console.log(`AKD connection test successful for ${traderUsername}.`);
        return true;
    } catch (error: any) {
        console.error(
            `AKD connection test FAILED for ${traderUsername}: ${error.message}`,
        );
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
        }
        return false;
    }
  }
}

export const getAllAccountDetails = new AKDClient().getAllAccountDetails.bind(new AKDClient());
export const testConnection = new AKDClient().testConnection.bind(new AKDClient());

// --- Exports ---
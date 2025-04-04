// akdApiClient.ts
import * as soap from "soap";
import * as zlib from "zlib";
import { promisify } from "util";
import { Buffer } from "buffer"; // Ensure Buffer is explicitly imported

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

async function getTradingAccounts(
    client: any,
    traderId: string,
): Promise<{ result: FetchResult; primaryAccount: string }> {
    const apiMethod = "TradAccounts";
    console.log(`---> Fetching ${apiMethod} for trader ${traderId}...`);
    const targetHeaders = ["Account", "Name", "Status", "Type", "Balance"];
    let primaryAccount = DEFAULT_ACCOUNT_FALLBACK;
    const fallbackData: string[][] = [
        [DEFAULT_ACCOUNT_FALLBACK, traderId, "Auth Failed", "N/A", "N/A"],
    ];

    try {
        const params = { userName: traderId };
        console.log(
            `[${apiMethod}] Calling ${apiMethod}Async with params:`,
            params,
        );
        const result = await client.TradAccountsAsync(params);
        const processed = await processAndUnzipResponse(apiMethod, result);

        if (processed?.toLowerCase() === "not authorized") {
            console.error(
                `[${apiMethod}] Authentication failed for user ${traderId}. Response: "Not Authorized"`,
            );
            return {
                result: { headers: targetHeaders, data: fallbackData },
                primaryAccount,
            };
        }
        if (!processed) {
            console.warn(
                `[${apiMethod}] Processed response is null or empty for ${traderId}.`,
            );
            return {
                result: { headers: targetHeaders, data: [] },
                primaryAccount,
            };
        }

        const structuredData = parseResponseToStructure(
            apiMethod,
            processed,
            KEY_MAPPINGS[apiMethod],
        );

        const accountNumbers = extractAccountNumbers(
            structuredData,
            "AccountCode",
        );

        if (accountNumbers.length > 0) {
            primaryAccount = accountNumbers[0];
            console.log(
                `[${apiMethod}] Primary account determined: ${primaryAccount}`,
            );
            const dataOut: string[][] = structuredData.map((item) => [
                toStringSafe(item.AccountCode),
                toStringSafe(item.AccountTitle),
                toStringSafe(item.AccountStatus || "Active"),
                "Unknown",
                "PKR ?",
            ]);
            console.log(
                `[${apiMethod}] Success. Found ${dataOut.length} accounts.`,
            );
            return {
                result: { headers: targetHeaders, data: dataOut },
                primaryAccount,
            };
        } else {
            console.warn(
                `[${apiMethod}] No valid account numbers extracted for ${traderId}.`,
            );
            if (
                structuredData.length > 0 &&
                structuredData[0]?.[KEY_MAPPINGS[apiMethod][0]] ===
                    "Not Authorized"
            ) {
                console.error(
                    `[${apiMethod}] Auth failed (detected during parsing).`,
                );
                return {
                    result: { headers: targetHeaders, data: fallbackData },
                    primaryAccount: DEFAULT_ACCOUNT_FALLBACK,
                };
            }
            return {
                result: { headers: targetHeaders, data: [] },
                primaryAccount: DEFAULT_ACCOUNT_FALLBACK,
            };
        }
    } catch (error: any) {
        console.error(
            `[${apiMethod}] CRITICAL ERROR for ${traderId}: ${error.message}`,
        );
        console.error(error.stack);
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
        }
        return {
            result: { headers: targetHeaders, data: fallbackData },
            primaryAccount,
        };
    }
}

async function getOrderHistory(
    client: any,
    traderId: string,
    accountNo: string,
    startDate = COMMON_START_DATE,
    endDate = COMMON_END_DATE,
): Promise<FetchResult> {
    const apiMethod = "GetOrderHistory";
    console.log(
        `---> Fetching ${apiMethod} for trader ${traderId}, account ${accountNo}...`,
    );
    const targetHeaders = [
        "Order ID",
        "Symbol",
        "Side",
        "Type",
        "Quantity",
        "Price",
        "Status",
        "Date",
    ];
    const fallbackData: string[][] = [
        [
            "N/A",
            "N/A",
            "N/A",
            "N/A",
            "N/A",
            "N/A",
            accountNo === DEFAULT_ACCOUNT_FALLBACK ? "Auth Failed" : "Error",
            "N/A",
        ],
    ];

    if (accountNo === DEFAULT_ACCOUNT_FALLBACK) {
        console.warn(
            `[${apiMethod}] Skipping API call due to previous authentication failure.`,
        );
        return { headers: targetHeaders, data: fallbackData };
    }

    try {
        const params = {
            trader: traderId,
            accountNo: accountNo,
            pincode: "",
            scrip: "ALL",
            type: "ALL",
            startDate: startDate,
            endDate: endDate,
            from: "OrderHistory",
        };
        console.log(
            `[${apiMethod}] Calling ${apiMethod}Async with params:`,
            params,
        );
        const result = await client.GetOrderHistoryAsync(params);
        const processed = await processAndUnzipResponse(apiMethod, result);

        if (processed?.toLowerCase() === "not authorized") {
            console.error(
                `[${apiMethod}] Authentication failed for this call.`,
            );
            return {
                headers: targetHeaders,
                data: [
                    [
                        "N/A",
                        "N/A",
                        "N/A",
                        "N/A",
                        "N/A",
                        "N/A",
                        "Auth Failed",
                        "N/A",
                    ],
                ],
            };
        }
        if (!processed) {
            console.warn(
                `[${apiMethod}] Processed response is null or empty for ${traderId}.`,
            );
            return { headers: targetHeaders, data: [] };
        }

        const structuredData = parseResponseToStructure(
            apiMethod,
            processed,
            KEY_MAPPINGS[apiMethod],
        );

        if (
            structuredData.length === 1 &&
            structuredData[0]?.[KEY_MAPPINGS[apiMethod][0]] === "Not Authorized"
        ) {
            console.error(
                `[${apiMethod}] Authentication failed (detected during parsing).`,
            );
            return {
                headers: targetHeaders,
                data: [
                    [
                        "N/A",
                        "N/A",
                        "N/A",
                        "N/A",
                        "N/A",
                        "N/A",
                        "Auth Failed",
                        "N/A",
                    ],
                ],
            };
        }

        if (structuredData.length > 0 && !structuredData[0]?.error) {
            const dataOut: string[][] = structuredData.map((item, index) => [
                toStringSafe(item.Reference || `OH-${index + 1}`),
                toStringSafe(item.Symbol),
                toStringSafe(item.Side),
                toStringSafe(item.OrderType),
                toStringSafe(item.Quantity),
                toStringSafe(item.Rate),
                "Completed",
                toStringSafe(item.OrderDate || item.TradeDate || ""),
            ]);
            console.log(
                `[${apiMethod}] Success. Found ${dataOut.length} orders.`,
            );
            return { headers: targetHeaders, data: dataOut };
        }

        console.warn(
            `[${apiMethod}] No valid data or parsing error for ${traderId}. Using fallback.`,
        );
        return { headers: targetHeaders, data: fallbackData };
    } catch (error: any) {
        console.error(
            `Error in ${apiMethod} for ${traderId}: ${error.message}`,
        );
        console.error(error.stack);
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
        }
        return { headers: targetHeaders, data: fallbackData };
    }
}

async function getPositions(
    client: any,
    traderId: string,
    accountNo: string,
): Promise<FetchResult> {
    const apiMethod = "GetCollateral";
    console.log(
        `---> Fetching Positions (via ${apiMethod}) for trader ${traderId}, account ${accountNo}...`,
    );
    const targetHeaders = [
        "Symbol",
        "Quantity",
        "Avg Buy Rate",
        "MTM Rate",
        "Unsettled P/L",
        "Value After Haircut",
    ];
    const fallbackData: string[][] = [
        [
            "N/A",
            "N/A",
            "N/A",
            "N/A",
            accountNo === DEFAULT_ACCOUNT_FALLBACK ? "Auth Failed" : "Error",
            "N/A",
        ],
    ];

    if (accountNo === DEFAULT_ACCOUNT_FALLBACK) {
        console.warn(
            `[${apiMethod}] Skipping API call due to previous authentication failure.`,
        );
        return { headers: targetHeaders, data: fallbackData };
    }
    if (typeof client.GetCollateralAsync !== "function") {
        console.error(
            `[${apiMethod}] Method GetCollateralAsync not found on SOAP client.`,
        );
        return { headers: targetHeaders, data: fallbackData };
    }

    try {
        const params = { UserID: traderId, Account: accountNo };
        console.log(
            `[${apiMethod}] Calling ${apiMethod}Async with params:`,
            params,
        );
        const result = await client.GetCollateralAsync(params);
        const processed = await processAndUnzipResponse(apiMethod, result);

        if (processed?.toLowerCase() === "not authorized") {
            console.error(
                `[${apiMethod}] Authentication failed for this call.`,
            );
            return {
                headers: targetHeaders,
                data: [["N/A", "N/A", "N/A", "N/A", "Auth Failed", "N/A"]],
            };
        }
        if (!processed) {
            console.warn(
                `[${apiMethod}] Processed response is null or empty for ${traderId}.`,
            );
            return { headers: targetHeaders, data: [] };
        }

        const structuredData = parseResponseToStructure(
            apiMethod,
            processed,
            KEY_MAPPINGS[apiMethod],
        );

        if (
            structuredData.length === 1 &&
            structuredData[0]?.[KEY_MAPPINGS[apiMethod][0]] === "Not Authorized"
        ) {
            console.error(
                `[${apiMethod}] Authentication failed (detected during parsing).`,
            );
            return {
                headers: targetHeaders,
                data: [["N/A", "N/A", "N/A", "N/A", "Auth Failed", "N/A"]],
            };
        }
        if (structuredData.length === 1 && structuredData[0]?.error) {
            console.error(
                `[${apiMethod}] Parsing failed. Raw response: ${structuredData[0].raw_response}`,
            );
            return { headers: targetHeaders, data: fallbackData }; // Use generic error fallback
        }

        if (structuredData.length > 0 && !structuredData[0]?.error) {
            const dataOut: string[][] = structuredData.map((item) => [
                toStringSafe(item.Symbol),
                toStringSafe(item.Quantity),
                toStringSafe(item.AvgBuyRate),
                toStringSafe(item.MTM_Rate),
                toStringSafe(item.UnsettledPL),
                toStringSafe(item.ValueAfterHaircut),
            ]);
            console.log(
                `[${apiMethod}] Success. Found ${dataOut.length} positions.`,
            );
            return { headers: targetHeaders, data: dataOut };
        }

        console.warn(
            `[${apiMethod}] No valid positions found or parsing error for ${traderId}. Using fallback.`,
        );
        return { headers: targetHeaders, data: fallbackData };
    } catch (error: any) {
        console.error(
            `Error in ${apiMethod} for ${traderId}: ${error.message}`,
        );
        console.error(error.stack);
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
        }
        return { headers: targetHeaders, data: fallbackData };
    }
}



// --- ADD GetAccountStatement Fetch Function ---
async function getAccountStatement(client: any, traderId: string, accountNo: string, startDate = COMMON_START_DATE, endDate = COMMON_END_DATE): Promise<FetchResult> {
    const apiMethod = "GetAccountStatement";
    console.log(`---> Fetching ${apiMethod} for trader ${traderId}, account ${accountNo}...`);
    const targetHeaders = ["Voucher No", "Date", "Description", "Debit", "Credit", "Balance"]; // Adjusted Headers for UI
    const fallbackData: string[][] = [[ "N/A", "N/A", accountNo === DEFAULT_ACCOUNT_FALLBACK ? "Auth Failed" : "Error", "N/A", "N/A", "N/A" ]];

    if (accountNo === DEFAULT_ACCOUNT_FALLBACK) {
         console.warn(`[${apiMethod}] Skipping API call due to previous authentication failure.`);
         return { headers: targetHeaders, data: fallbackData };
    }
    if (typeof client.GetAccountStatementAsync !== 'function') {
        console.error(`[${apiMethod}] Method GetAccountStatementAsync not found on SOAP client.`);
        return { headers: targetHeaders, data: fallbackData };
    }

    try {
        // Parameters for GetAccountStatement might differ slightly, adjust as needed
        const params = {
            userName: traderId, // Might be userName instead of traderId
            accountNo: accountNo,
            startDate: startDate,
            endDate: endDate,
            from: "TradeCast" // 'from' parameter might be needed
        };
        console.log(`[${apiMethod}] Calling ${apiMethod}Async with params:`, params);
        const result = await client.GetAccountStatementAsync(params);
        const processed = await processAndUnzipResponse(apiMethod, result);

         if (processed?.toLowerCase() === 'not authorized') {
             console.error(`[${apiMethod}] Authentication failed for this call.`);
             return { headers: targetHeaders, data: [[ "N/A", "N/A", "Auth Failed", "N/A", "N/A", "N/A" ]] };
          }
          if (!processed) {
              console.warn(`[${apiMethod}] Processed response is null or empty for ${traderId}.`);
               return { headers: targetHeaders, data: [] };
          }

        const structuredData = parseResponseToStructure(apiMethod, processed, KEY_MAPPINGS[apiMethod]);

         if (structuredData.length === 1 && structuredData[0]?.[KEY_MAPPINGS[apiMethod][0]] === 'Not Authorized') {
              console.error(`[${apiMethod}] Authentication failed (detected during parsing).`);
               return { headers: targetHeaders, data: [[ "N/A", "N/A", "Auth Failed", "N/A", "N/A", "N/A" ]] };
          }
          if (structuredData.length === 1 && structuredData[0]?.error) {
               console.error(`[${apiMethod}] Parsing failed. Raw response: ${structuredData[0].raw_response}`);
                return { headers: targetHeaders, data: fallbackData };
           }

        if (structuredData.length > 0 && !structuredData[0]?.error) {
            const dataOut: string[][] = structuredData.map(item => [
                toStringSafe(item.VoucherNo),
                toStringSafe(item.Date),
                toStringSafe(item.Description),
                toStringSafe(item.Debit),
                toStringSafe(item.Credit),
                toStringSafe(item.Balance)
                // Note: Skipping UnknownCol2 for UI clarity
            ]);
            console.log(`[${apiMethod}] Success. Found ${dataOut.length} statement entries.`);
            return { headers: targetHeaders, data: dataOut };
        }

        console.warn(`[${apiMethod}] No valid data or parsing error for ${traderId}. Using fallback.`);
        return { headers: targetHeaders, data: fallbackData };

    } catch (error: any) {
        console.error(`Error in ${apiMethod} for ${traderId}: ${error.message}`);
        console.error(error.stack);
        if (error.Fault) { console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2)); }
        return { headers: targetHeaders, data: fallbackData };
    }
}

async function getAccountInfo(
    client: any,
    traderId: string,
    accountNo: string,
): Promise<FetchResult> {
    const apiMethod = "GetExposureDynamic";
    console.log(
        `---> Fetching Account Info (via ${apiMethod}) for trader ${traderId}, account ${accountNo}...`,
    );
    const targetHeaders = ["Detail", "Value"];
    const fallbackData: string[][] = [
        [
            "Status",
            accountNo === DEFAULT_ACCOUNT_FALLBACK
                ? "Auth Failed"
                : "Error fetching details",
        ],
    ];

    if (accountNo === DEFAULT_ACCOUNT_FALLBACK) {
        console.warn(
            `[${apiMethod}] Skipping API call due to previous authentication failure.`,
        );
        return { headers: targetHeaders, data: fallbackData };
    }
    if (typeof client.GetExposureDynamicAsync !== "function") {
        console.error(
            `[${apiMethod}] Method GetExposureDynamicAsync not found on SOAP client.`,
        );
        return {
            headers: targetHeaders,
            data: [["Error", "API Method Unavailable"]],
        };
    }

    try {
        const params = { UserID: traderId, account: accountNo, approved: "0" };
        console.log(
            `[${apiMethod}] Calling ${apiMethod}Async with params:`,
            params,
        );
        const result = await client.GetExposureDynamicAsync(params);
        const processed = await processAndUnzipResponse(apiMethod, result);

        if (processed?.toLowerCase() === "not authorized") {
            console.error(
                `[${apiMethod}] Authentication failed for this call.`,
            );
            return {
                headers: targetHeaders,
                data: [["Status", "Auth Failed"]],
            };
        }
        if (!processed) {
            console.warn(
                `[${apiMethod}] Processed response is null or empty for ${traderId}.`,
            );
            return { headers: targetHeaders, data: [] };
        }

        const structuredData = parseExposureDynamic(apiMethod, processed); // Use the special parser

        if (
            structuredData.length === 1 &&
            structuredData[0]?.Metric === "Error"
        ) {
            console.error(
                `[${apiMethod}] Authentication failed or error during parsing:`,
                structuredData[0].Error,
            );
            return {
                headers: targetHeaders,
                data: [
                    ["Status", structuredData[0].Error || "Auth/Parse Failed"],
                ],
            };
        }
        if (structuredData.length === 1 && structuredData[0]?.error) {
            console.error(
                `[${apiMethod}] Parsing failed. Raw response: ${structuredData[0].raw_response}`,
            );
            return { headers: targetHeaders, data: fallbackData }; // Use generic error fallback
        }

        if (structuredData.length > 0 && !structuredData[0]?.error) {
            const dataOut: string[][] = [["Account ID", accountNo]];
            const findMetricValue = (
                metricNamePattern: RegExp,
                marketKeyPattern: RegExp = /^REG/i,
            ): string | null => {
                const metricRow = structuredData.find((item) =>
                    metricNamePattern.test(item.Metric),
                );
                if (!metricRow) return null;
                const matchingMarketKey = Object.keys(metricRow).find(
                    (key) => key !== "Metric" && marketKeyPattern.test(key),
                );
                return matchingMarketKey
                    ? toStringSafe(metricRow[matchingMarketKey])
                    : null;
            };

            // Extract relevant details using RegEx patterns
            const balance = findMetricValue(/^Floating_Balance/i);
            const cashValue = findMetricValue(/^~Cash/i);
            const allowedLimitReg = findMetricValue(/^Allowed_Limit/i, /^REG/i);
            const availableAmtReg = findMetricValue(
                /^Available_Amount|^Available_Amt/i,
                /^REG/i,
            ); // Match both patterns
            const allowedLimitFut = findMetricValue(/^Allowed_Limit/i, /^FUT/i);
            const availableAmtFut = findMetricValue(
                /^Available_Amount|^Available_Amt/i,
                /^FUT/i,
            ); // Match both patterns
            const exposure = findMetricValue(/^Exposure/i, /^FUT/i);
            const profitLoss = findMetricValue(/^Profit\/Loss/i, /^ODL/i); // Assuming ODL market

            if (balance) dataOut.push(["Floating Balance", balance]);
            if (cashValue) dataOut.push(["Cash", cashValue]);
            if (allowedLimitReg)
                dataOut.push(["Allowed Limit (REG)", allowedLimitReg]);
            if (availableAmtReg)
                dataOut.push(["Available Amount (REG)", availableAmtReg]);
            if (allowedLimitFut)
                dataOut.push(["Allowed Limit (FUT)", allowedLimitFut]);
            if (availableAmtFut)
                dataOut.push(["Available Amount (FUT)", availableAmtFut]);
            if (exposure) dataOut.push(["Exposure (FUT)", exposure]);
            if (profitLoss) dataOut.push(["Profit/Loss (ODL)", profitLoss]);

            console.log(`[${apiMethod}] Success. Extracted info.`);
            return { headers: targetHeaders, data: dataOut };
        }

        console.warn(
            `[${apiMethod}] No valid account info found or parsing error for ${traderId}. Using fallback.`,
        );
        return { headers: targetHeaders, data: fallbackData };
    } catch (error: any) {
        console.error(
            `Error in ${apiMethod} for ${traderId}: ${error.message}`,
        );
        console.error(error.stack);
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
        }
        return { headers: targetHeaders, data: fallbackData };
    }
}

// ============================
// Main Exported Functions
// ============================

async function fetchAllAccountDetails(
    traderUsername: string,
    traderPassword: string,
) {
    // Log received TRADER credentials (NO MASKING FOR DEBUG)
    console.log(
        `Credentials received for AKD connection: {"username":"${traderUsername}","password":"${traderPassword}"}`,
    );

    if (!traderUsername || !SERVICE_USERNAME || !SERVICE_PASSWORD) {
        console.error(
            "Error: Missing Trader Credentials or Service Credentials.",
        );
        return {
            /* ... error structure ... */
        };
    }

    const requestId = Date.now();
    console.log(
        `Fetching AKD details for ${traderUsername}, request ID: ${requestId}`,
    );

    try {
        console.log(
            `Attempting SOAP connection to ${WSDL_URL} using SERVICE credentials...`,
        );
        console.log(`   Service Username: ${SERVICE_USERNAME}`);
        console.log(`   Service Password: ${SERVICE_PASSWORD}`);

        const timestamp = new Date().toISOString();
        const client = await soap.createClientAsync(WSDL_URL);

        // --- SET SERVICE AUTHENTICATION ---
        client.setSecurity(
            new soap.BasicAuthSecurity(SERVICE_USERNAME, SERVICE_PASSWORD),
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
                timestamp,
                dataSource: "error_auth",
            };
        }
        console.log(
            `Using primary account ${primaryAccount} for subsequent API calls. Request ID: ${requestId}`,
        );

        // Fetch other details IN PARALLEL for potentially faster loading
        const [orderHistory, positions, accountInfo, accountStatement] = await Promise.all([
             getOrderHistory(client, traderUsername, primaryAccount),
             getPositions(client, traderUsername, primaryAccount),
             getAccountInfo(client, traderUsername, primaryAccount),
             getAccountStatement(client, traderUsername, primaryAccount) // <-- ADDED CALL
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
                    accountStatement:     {
                        headers: accountStatement.headers,    

                        dataLength: accountStatement.data.length,
                    }
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
            timestamp: new Date().toISOString(),
            dataSource: "error",
        };
        return fallbackErrorData;
    }
}









async function testConnection(
    traderUsername: string,
    traderPassword: string,
): Promise<boolean> {
    // Log received TRADER credentials (NO MASKING FOR DEBUG)
    console.log(
        `Testing AKD connection for trader: ${traderUsername}, password: ${traderPassword}`,
    );

    if (!traderUsername || !SERVICE_USERNAME || !SERVICE_PASSWORD) {
        console.error(
            "Test Connection Error: Missing Trader or Service credentials.",
        );
        return false;
    }

    try {
        console.log(
            `Attempting SOAP connection using SERVICE credentials for test...`,
        );
        console.log(`   Service Username: ${SERVICE_USERNAME}`);
        console.log(`   Service Password: ${SERVICE_PASSWORD}`);

        const client = await soap.createClientAsync(WSDL_URL);
        client.setSecurity(
            new soap.BasicAuthSecurity(SERVICE_USERNAME, SERVICE_PASSWORD),
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

// --- Exports ---
const getAllAccountDetails = fetchAllAccountDetails;
export { getAllAccountDetails, testConnection };

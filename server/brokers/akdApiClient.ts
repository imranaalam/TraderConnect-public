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
        "UnknownCol2", // This might need adjustment based on actual API output
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

    // --- ADDED MAPPINGS FOR LOGS ---
    GetTradeLog: [
        "LogInfo", "Market", "Symbol", "Timestamp", "TradeID", "OrderRef", "Side",
        "OrigQty", "Price", "ExecRef", "Account", "Status", "Origin", "FilledQty",
        "Value", "Commission", "AssetType"
    ],
    GetDailyActivityLog: [
        "UserInfo", "Market", "Symbol", "Account", "Price", "OrderRef", "HostOrderRef",
        "OrigQty", "FilledQty", "RemainingQty", "ExecRef", "Value", "Status",
        "AssetType", "Timestamp", "SubStatus"
    ],
    GetOutstandingLog: [
        "LogInfo", "Symbol", "Price", "Quantity", "Account", "OrderRef",
        "HostOrderRef", "Origin", "Side", "Market", "Status", "Timestamp",
        "OrderType"
    ],
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
        `[${apiMethod}] processAndUnzipResponse received rawSoapResult type: ${typeof rawSoapResult}`,
    );
    // Avoid logging potentially huge raw results unless necessary for deep debugging
    // console.log(`[${apiMethod}] Raw SOAP Result:`, JSON.stringify(rawSoapResult, null, 2));

    // Attempt to extract the core response data
    let resp =
        rawSoapResult?.[0]?.return ??
        rawSoapResult?.[0]?.[`${apiMethod}Result`] ?? // Common pattern { MethodNameResult: '...' }
        rawSoapResult?.[`${apiMethod}Result`] ?? // Direct { MethodNameResult: '...' }
        rawSoapResult?.[0] ?? // If result is an array, take the first element
        rawSoapResult; // Fallback to the raw result itself

    // Further refinement: sometimes it's nested under 'return' within the first element
    if (resp && typeof resp === "object" && resp.return !== undefined) {
        console.log(`[${apiMethod}] Found nested 'return' property.`);
        resp = resp.return;
    }

    console.log(
        `[${apiMethod}] Extracted response part for processing (Type: ${typeof resp}):`,
        typeof resp === "string" ? `"${resp.substring(0, 150)}..."` : resp instanceof Buffer ? `<Buffer ${resp.length} bytes>` : resp,
    );


    if (resp === null || resp === undefined) {
        console.log(
            `[${apiMethod}] Extracted response part is null or undefined.`,
        );
        return null;
    }

    try {
        if (Buffer.isBuffer(resp)) {
            console.log(`[${apiMethod}] Response is a Buffer.`);
            if (resp.length > 2 && resp[0] === 0x1f && resp[1] === 0x8b) {
                // Gzip magic number
                console.log(
                    `[${apiMethod}] Buffer is Gzipped. Decompressing...`,
                );
                const decompressed = await gunzipAsync(resp);
                const decodedString = decompressed.toString("utf-8");
                console.log(
                    `[${apiMethod}] Decompressed string (from Buffer): "${decodedString.substring(0, 150)}..."`,
                );
                return decodedString;
            } else {
                console.log(
                    `[${apiMethod}] Buffer is not Gzipped. Decoding as UTF-8...`,
                );
                const decodedString = resp.toString("utf-8");
                console.log(
                    `[${apiMethod}] Decoded string (from Buffer): "${decodedString.substring(0, 150)}..."`,
                );
                return decodedString;
            }
        } else if (typeof resp === "string") {
            console.log(`[${apiMethod}] Response is a string.`);

            // Heuristic: Does it look like Base64? (Improved check)
            // Check length, charset, and padding. Avoid overly short strings.
            const likelyBase64 = resp.length > 20 && /^[A-Za-z0-9+/]+(?:={0,2})$/.test(resp) && (resp.length % 4 === 0);

            if (likelyBase64) {
                console.log(
                    `[${apiMethod}] String looks like Base64. Attempting decode...`,
                );
                try {
                    const decodedBuffer = Buffer.from(resp, "base64");
                    console.log(
                        `[${apiMethod}] Base64 decode successful (${decodedBuffer.length} bytes). Checking for Gzip...`,
                    );
                    // Check Gzip magic number on the decoded buffer
                    if (decodedBuffer.length > 2 && decodedBuffer[0] === 0x1f && decodedBuffer[1] === 0x8b) {
                        console.log(
                            `[${apiMethod}] Decoded buffer is Gzipped. Decompressing...`,
                        );
                        const decompressed = await gunzipAsync(decodedBuffer);
                        const decodedString = decompressed.toString("utf-8");
                        console.log(
                            `[${apiMethod}] Decompressed string (from Base64->Gzip): "${decodedString.substring(0, 150)}..."`,
                        );
                        return decodedString;
                    } else {
                        // It was Base64, but not Gzipped. Decode the buffer as UTF-8.
                        const decodedString = decodedBuffer.toString("utf-8");
                        console.log(
                            `[${apiMethod}] Decoded Base64 (but not Gzipped) string: "${decodedString.substring(0, 150)}..."`,
                        );
                        // Basic check if the result makes sense (e.g., contains common delimiters or known errors)
                        // Avoid returning garbled text if Base64 decoding resulted in binary data misinterpretation
                        if (decodedString.includes("|") || decodedString.includes(";") || decodedString.toLowerCase().includes("authorized") || decodedString.toLowerCase().includes("record")) {
                             return decodedString;
                        } else if (decodedString.includes("\uFFFD")) { // Unicode replacement character suggests decoding issues
                            console.warn(`[${apiMethod}] Base64 decoded string contains replacement characters (likely not text). Reverting to original string.`);
                            return resp; // Return the original base64 string
                        } else {
                            console.warn(`[${apiMethod}] Base64 decoded string doesn't appear to be expected text format. Reverting to original string.`);
                            return resp; // Return the original base64 string
                        }
                    }
                } catch (base64Error: any) {
                    console.log(
                        `[${apiMethod}] Base64 decode failed: ${base64Error.message}. Assuming plain string.`,
                    );
                    return resp; // Treat as plain string if decode fails
                }
            } else {
                console.log(
                    `[${apiMethod}] String does not look like Base64. Treating as plain text.`,
                );
                return resp; // Not Base64, return as is
            }
        } else {
            console.log(
                `[${apiMethod}] Response is neither Buffer nor string (Type: ${typeof resp}). Converting to string...`,
            );
            const stringified = String(resp);
            console.log(`[${apiMethod}] Stringified response: "${stringified.substring(0, 150)}..."`);
            return stringified;
        }
    } catch (error: any) {
        console.error(
            `[${apiMethod}] Error during response processing/decompression: ${error.message}. Raw resp part: ${String(resp).substring(0, 100)}...`, // Stringify resp in error log
        );
        // Return the original response part as a string in case of error
        return String(resp);
    }
}


/** Cleans a string for use as a JSON key */
function cleanKey(keyStr: string | null | undefined): string {
    if (!keyStr) return "Unnamed_Key";
    // Allow alphanumeric, underscore, hyphen. Replace disallowed chars with empty string.
    const cleaned = keyStr.replace(/[^a-zA-Z0-9_\-]/g, "").trim();
    // Replace sequences of underscores/hyphens with a single underscore, handle leading/trailing
    const finalKey = cleaned.replace(/[\s_-]+/g, "_").replace(/^_|_$/g, "");
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
    );
    if (!responseStr || !responseStr.trim()) {
        console.log(`[${apiMethod}] Input string is null or empty.`);
        return [];
    }

    // Standardize checks for no data/errors
    const lowerStripped = responseStr.trim().toLowerCase();
    const noDataMessages = ["no record", "no data", "no outstanding order"];
    const isNoData = noDataMessages.some(msg => lowerStripped.includes(msg));
    const isNotAuthorized = lowerStripped === "not authorized";

    if (isNoData && !isNotAuthorized) {
        console.log(
             `[${apiMethod}] Detected 'no data' message in response string. API Message: "${responseStr.trim()}"`
        );
        return []; // Return empty for general "no data"
    }

    if (isNotAuthorized) {
        console.log(`[${apiMethod}] Detected 'not authorized' in response string.`);
        // If a key mapping is provided, return a structured error object
        if (keyMapping && keyMapping.length > 0) {
            const errorObj: Record<string, any> = {};
            errorObj[keyMapping[0]] = "Not Authorized"; // Use the first mapped key for the error message
            for (let i = 1; i < keyMapping.length; i++) {
                errorObj[keyMapping[i]] = null; // Fill other expected keys with null
            }
             console.log(`[${apiMethod}] Returning structured auth error object.`);
            return [errorObj];
        } else {
             // If no mapping, return a generic error structure
             console.log(`[${apiMethod}] Returning generic auth error object (no mapping provided).`);
            return [{ Error: "Not Authorized" }];
        }
    }


    try {
        const rows = responseStr
            .trim()
            .split("|")
            .map((r) => r.trim())
            .filter((r) => r); // Filter out empty rows resulting from split

        if (!rows.length) {
            console.log(
                `[${apiMethod}] No rows after splitting response by '|'.`,
            );
            return [];
        }
        console.log(`[${apiMethod}] Found ${rows.length} potential rows.`);

        let headersToUse: string[] | undefined = keyMapping;
        let dataRowsStr: string[] = rows;
        let headerRowDetected = false;

        // --- Header Logic ---
        if (!headersToUse) {
             // --- Auto-detect header logic ---
             console.log(`[${apiMethod}] No key mapping. Attempting auto-detection...`);
             if (rows.length >= 1) {
                const firstRowCols = rows[0].split(";").map(h => h.trim());
                 const looksLikeHeader = firstRowCols.length > 0 && firstRowCols.filter(h => /[a-zA-Z]/.test(h) && !/^\d+(\.\d+)?$/.test(h.replace(/[,%\s]/g, ''))).length >= firstRowCols.length / 2;
                 let structureDiffers = false;
                 if(rows.length > 1) {
                    const secondRowCols = rows[1].split(';').map(c => c.trim());
                     if(firstRowCols.length === secondRowCols.length) {
                         structureDiffers = firstRowCols[0] !== secondRowCols[0] && looksLikeHeader;
                         const firstRowTypes = firstRowCols.map(c => /^\d+(\.\d+)?$/.test(c) ? 'num' : 'str');
                         const secondRowTypes = secondRowCols.map(c => /^\d+(\.\d+)?$/.test(c) ? 'num' : 'str');
                         if(firstRowTypes.join('') !== secondRowTypes.join('')) { structureDiffers = true; }
                     }
                 }

                 if (rows.length > 1 && (looksLikeHeader || structureDiffers) ) {
                     console.log(`[${apiMethod}] Auto-detected first row as header. Skipping.`);
                     const rawHeaders = firstRowCols;
                     headersToUse = rawHeaders.map((h) => cleanKey(h));
                      dataRowsStr = rows.slice(1);
                     headerRowDetected = true;
                     const usedCounts: Record<string, number> = {};
                     const finalHeaders: string[] = [];
                     for (const h of headersToUse) {
                         const baseName = h || "Unnamed_Key";
                         const count = (usedCounts[baseName] || 0) + 1;
                         usedCounts[baseName] = count;
                         finalHeaders.push(count === 1 ? baseName : `${baseName}_${count}`);
                     }
                     headersToUse = finalHeaders;
                     console.log(`[${apiMethod}] Final unique auto-detected headers: [${headersToUse.join(", ")}]`);
                 } else {
                     console.log(`[${apiMethod}] Auto-detection suggests no header row or single row data. Generating generic headers.`);
                     const numCols = firstRowCols.length > 0 ? firstRowCols.length : 1; // Handle empty first row case
                     headersToUse = Array(numCols).fill(0).map((_, i) => `Col${i + 1}`);
                     dataRowsStr = rows;
                 }
             } else {
                console.log(`[${apiMethod}] Cannot determine headers: No rows available for auto-detection.`);
                headersToUse = ["Col1"]; // Default to at least one column header
             }
        } else {
             // --- Logic when keyMapping IS provided ---
             console.log(`[${apiMethod}] Using provided key mapping: [${headersToUse.join(", ")}]`);
             if (rows.length > 1) {
                 const firstRowCols = rows[0].split(";").map(h => h.trim());
                 const firstRowLooksLikeHeader = firstRowCols.length > 0 &&
                       (firstRowCols.some(c => c.length > 0 && !/^\d+(\.\d+)?$/.test(c.replace(/[,%\s-]/g, '')))) && // Contains non-numeric-like content
                       (firstRowCols.length >= headersToUse.length / 2);

                 if (firstRowLooksLikeHeader) {
                     const secondRowCols = rows[1].split(';').map(c => c.trim());
                     if(firstRowCols[0] !== secondRowCols[0] || firstRowCols.length !== secondRowCols.length) {
                         console.log(`[${apiMethod}] Provided mapping, but first row looks like a header and differs from second. Skipping first row.`);
                         dataRowsStr = rows.slice(1);
                         headerRowDetected = true;
                     } else {
                         console.log(`[${apiMethod}] Provided mapping, first row looks like header BUT is similar to second. NOT skipping.`);
                     }
                 } else {
                     console.log(`[${apiMethod}] Provided mapping, first row doesn't look like a text header. Not skipping.`);
                 }
             } else {
                 console.log(`[${apiMethod}] Provided mapping, but only one row. Assuming it's data.`);
             }
        }
        // --- End Header Logic ---

        if (!headersToUse || headersToUse.length === 0) {
            console.warn(`[${apiMethod}] Warning: Could not determine headers for response. Returning raw rows.`);
            return dataRowsStr.map((r, index) => ({ raw_row: r, index }));
        }

        const structuredData: Record<string, any>[] = [];
        const numHeaders = headersToUse.length;
        console.log(`[${apiMethod}] Processing ${dataRowsStr.length} data rows using ${numHeaders} headers (${headerRowDetected ? 'header row skipped' : 'header row not skipped'}). Headers: [${headersToUse.join(', ')}]`);

        for (const rowStr of dataRowsStr) {
            const cols = rowStr.split(";").map((c) => c.trim());
            const rowDict: Record<string, any> = {};

            for (let i = 0; i < numHeaders; i++) {
                const headerKey = headersToUse[i];
                const value = (i < cols.length && cols[i] !== "null") ? cols[i] : null;
                rowDict[headerKey] = value;
            }

            if (cols.length > numHeaders) {
                console.warn(`[${apiMethod}] Row has more columns (${cols.length}) than headers (${numHeaders}). Adding extra columns as ExtraCol_X.`);
                for (let i = numHeaders; i < cols.length; i++) {
                    rowDict[`ExtraCol_${i + 1}`] = cols[i] === "null" ? null : cols[i];
                }
            } else if (cols.length < numHeaders) {
                 console.warn(`[${apiMethod}] Row has fewer columns (${cols.length}) than headers (${numHeaders}). Missing values will be null.`);
                 for (let i = cols.length; i < numHeaders; i++) {
                     if (!rowDict.hasOwnProperty(headersToUse[i])) {
                         rowDict[headersToUse[i]] = null;
                     }
                 }
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
             `Response snippet: "${responseStr?.substring(0, 200)}..."`
        );
        return [{ error: "Parsing failed", details: error.message, raw_response_snippet: responseStr?.substring(0, 500) }];
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
        console.log(`[${apiMethod}] Input string is null or empty.`);
        return [];
    }

    const lowerStripped = responseStr.trim().toLowerCase();
    if (lowerStripped.includes("no record") || lowerStripped.includes("no data")) {
         console.log(`[${apiMethod}] Detected 'no data' message.`);
         return [];
    }
    if (lowerStripped === "not authorized") {
         console.log(`[${apiMethod}] Detected 'not authorized' message.`);
         return [{ Metric: "Error", Value: "Not Authorized" }];
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
                `[${apiMethod}] Not enough rows (${rows.length}) for specific exposure parsing. Falling back to standard parser.`,
            );
            return parseResponseToStructure(apiMethod, responseStr); // Pass null for keyMapping
        }

        const marketHeadersRaw = rows[0].split(";").map((h) => h.trim());
        if (!marketHeadersRaw || marketHeadersRaw.length < 2 || marketHeadersRaw[0].toLowerCase().trim() !== "market name") {
            console.warn(
                `[${apiMethod}] Unexpected header format in Exposure data. Falling back to standard parser.`,
            );
             return parseResponseToStructure(apiMethod, responseStr); // Pass null for keyMapping
        }

        const marketKeys = marketHeadersRaw.slice(1).map((mh) => cleanKey(mh));
        console.log(`[${apiMethod}] Market keys: [${marketKeys.join(", ")}]`);

        const structuredData: Record<string, any>[] = [];
        const dataRows = rows.slice(1);

        console.log(
            `[${apiMethod}] Processing ${dataRows.length} metric rows...`,
        );
        for (const rowStr of dataRows) {
            const cols = rowStr.split(";").map((c) => c.trim());
            if (cols.length < 1) continue;

            const metricNameRaw = cols[0];
             const metricName = metricNameRaw;

            const rowDict: Record<string, any> = { Metric: metricName };

            for (let i = 0; i < marketKeys.length; i++) {
                const marketKey = marketKeys[i];
                 const valueIndex = i + 1;
                 const value = (valueIndex < cols.length && cols[valueIndex] !== "null") ? cols[valueIndex] : null;
                rowDict[marketKey] = value;
            }
             // Ensure all expected market keys exist, even if null
             marketKeys.forEach(key => {
                 if (!rowDict.hasOwnProperty(key)) {
                     rowDict[key] = null;
                 }
             });
            structuredData.push(rowDict);
        }
        console.log(
            `[${apiMethod}] Finished parsing exposure. Result length: ${structuredData.length}`,
        );
        return structuredData;

    } catch (error: any) {
        console.error(
            `[${apiMethod}] Error parsing GetExposureDynamic response: ${error.message}`,
            `Response snippet: "${responseStr?.substring(0, 200)}..."`
        );
        return [
            {
                error: "GetExposureDynamic parsing failed",
                details: error.message,
                raw_response_snippet: responseStr?.substring(0, 500),
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
            if (item && typeof item === "object" && Object.hasOwnProperty.call(item, accountKey)) {
                const accountNum = item[accountKey];
                if (
                    accountNum !== null &&
                    accountNum !== undefined &&
                    String(accountNum).trim().toLowerCase() !== "not authorized"
                ) {
                     const trimmedAccount = String(accountNum).trim();
                     if (trimmedAccount) {
                        accountNumbers.push(trimmedAccount);
                    }
                } else if (String(accountNum).trim().toLowerCase() === "not authorized") {
                    console.log(`[extractAccountNumbers] Found 'Not Authorized' value for key '${accountKey}'.`);
                }
            }
        }
    } catch (error: any) {
        console.error(
            `Error extracting account numbers using key '${accountKey}': ${error.message}`,
        );
    }

    if (accountNumbers.length > 0) {
        console.log(
            `Extracted valid account numbers: [${accountNumbers.join(", ")}]`,
        );
    } else {
        console.log(
            `No valid account numbers extracted using key '${accountKey}'.`,
        );
    }
    return accountNumbers;
}

/** Safely convert value to string, returning empty string for null/undefined */
function toStringSafe(value: any): string {
    if (value === null || value === undefined) return "";
    return String(value);
}

// ============================
// Data Fetching Functions (Using Correct Parsing & Auth Handling)
// ============================

interface FetchResult {
    headers: string[];
    data: (string | null)[][];
    error?: string; // Optional error message
}

// --- Standard Fetch Function Structure (Includes extensive logging) ---
async function standardFetch(
    client: any,
    apiMethod: string,
    params: Record<string, any>,
    targetHeaders: string[], // Expected headers for the output FetchResult
    accountNoForAuthCheck?: string, // Pass account number to check if it's the fallback
): Promise<FetchResult> {
    const requestId = `${apiMethod}-${Date.now()}`; // Unique ID for this fetch
    console.log(`---> [${requestId}] Fetching ${apiMethod} with params:`, JSON.stringify(params));

    const authFailedMessage = "Authentication Failed";
    const genericErrorMessage = "Error fetching data";
    const parsingErrorMessage = "Error parsing response";

    // Helper to create consistent fallback data
    const createFallbackData = (message: string, isAuthFailure: boolean = false): (string | null)[][] => {
        const dataRow = Array(targetHeaders.length || 1).fill(isAuthFailure ? "Auth Failed" : message);
        return [dataRow];
    };

    // Determine initial status and error message for fallback
    const initialStatusMessage = accountNoForAuthCheck === DEFAULT_ACCOUNT_FALLBACK ? authFailedMessage : genericErrorMessage;
    const isInitialAuthFailure = accountNoForAuthCheck === DEFAULT_ACCOUNT_FALLBACK;

    if (isInitialAuthFailure) {
        console.warn(`[${requestId}] Skipping API call due to previous auth failure.`);
        return {
            headers: targetHeaders || [],
            data: createFallbackData("Auth Failed", true),
            error: authFailedMessage
        };
    }

    // Check if the SOAP method exists on the client
    const asyncMethodName = `${apiMethod}Async`;
    if (typeof client[asyncMethodName] !== "function") {
        const errorMsg = `API Method ${asyncMethodName} Unavailable`;
        console.error(`[${requestId}] ${errorMsg}.`);
        return {
            headers: targetHeaders || [],
            data: createFallbackData(errorMsg),
            error: errorMsg
        };
    }

    try {
        console.log(`[${requestId}] Calling ${asyncMethodName}...`);
        const result = await client[asyncMethodName](params);
        console.log(`[${requestId}] Raw SOAP result received (type: ${typeof result}):`, JSON.stringify(result)?.substring(0, 300) + '...');

        const processed = await processAndUnzipResponse(apiMethod, result);
        console.log(`[${requestId}] Processed response string:`, processed ? `"${processed.substring(0, 300)}..."` : processed);

        if (processed?.trim().toLowerCase() === "not authorized") {
            console.error(`[${requestId}] Authentication failed: API returned "Not Authorized".`);
            return {
                headers: targetHeaders || [],
                data: createFallbackData("Auth Failed", true),
                error: authFailedMessage
            };
        }

        if (!processed) {
            console.log(`[${requestId}] Processed response is null or empty. Returning empty data.`);
            return { headers: targetHeaders || [], data: [] }; // No error property for "no data"
        }

        const keyMapping = KEY_MAPPINGS[apiMethod];
        if (!keyMapping) { console.warn(`[${requestId}] No key mapping defined.`); }
        else { console.log(`[${requestId}] Using keyMapping: [${keyMapping.join(', ')}]`); }

        console.log(`[${requestId}] Calling parseResponseToStructure...`);
        const structuredData = parseResponseToStructure(apiMethod, processed, keyMapping);
        console.log(`[${requestId}] Structured data received (length: ${structuredData.length}):`, JSON.stringify(structuredData)?.substring(0, 500) + '...');

        if (structuredData.length === 1 && structuredData[0]?.error) {
            const errorDetail = structuredData[0].details || parsingErrorMessage;
            console.error(`[${requestId}] Parsing failed. Error: ${structuredData[0].error}. Details: ${errorDetail}`);
             return {
                 headers: targetHeaders || [],
                 data: createFallbackData(`Parsing Error: ${structuredData[0].error}`),
                 error: parsingErrorMessage // Keep generic error property
             };
        }

        const firstKey = keyMapping ? keyMapping[0] : "Error";
        if (structuredData.length === 1 && structuredData[0]?.[firstKey] === "Not Authorized") {
            console.error(`[${requestId}] Authentication failed (detected during parsing).`);
             return {
                 headers: targetHeaders || [],
                 data: createFallbackData("Auth Failed", true),
                 error: authFailedMessage
             };
        }

        if (structuredData.length > 0) {
            const headersForMapping = keyMapping || Object.keys(structuredData[0] || {});
            if (!headersForMapping.length && targetHeaders.length) {
                 console.warn(`[${requestId}] headersForMapping is empty, using targetHeaders as fallback for mapping.`);
            }
            console.log(`[${requestId}] Using headersForMapping for data construction: [${headersForMapping.join(', ')}]`);

             const dataOut: (string | null)[][] = structuredData.map((item) => {
                 // Ensure item is an object before mapping
                 if (typeof item !== 'object' || item === null) {
                     console.warn(`[${requestId}] Skipping non-object item in structuredData:`, item);
                     return Array(headersForMapping.length).fill(null); // Return array of nulls matching headers
                 }
                 return headersForMapping.map(header => {
                     if (Object.hasOwnProperty.call(item, header)) {
                         return toStringSafe(item[header]);
                     }
                     if (keyMapping?.includes(header)) {
                        console.warn(`[${requestId}] Expected header '${header}' not found in item:`, JSON.stringify(item).substring(0,100));
                     }
                     return null;
                 });
            });
            console.log(`[${requestId}] Final dataOut created (length: ${dataOut.length}):`, JSON.stringify(dataOut)?.substring(0, 500) + '...');

            console.log(`[${requestId}] Success. Found ${dataOut.length} items.`);
            const finalResult: FetchResult = {
                headers: targetHeaders || [],
                data: dataOut || [],
            };
            console.log(`[${requestId}] Returning final successful FetchResult:`, JSON.stringify(finalResult)?.substring(0, 500) + '...');
            return finalResult;
        } else {
             console.log(`[${requestId}] No data found after parsing. Returning empty data.`);
             return { headers: targetHeaders || [], data: [] }; // No error for no data
        }

    } catch (error: any) {
        console.error(`[${requestId}] CRITICAL ERROR in standardFetch: ${error.message}`);
        console.error(error.stack);
        let errorMsg = genericErrorMessage;
        let isAuthFailure = false;
        let errorDataMsg = "API Error";

        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
             errorMsg = `SOAP Fault Encountered`;
             errorDataMsg = "SOAP Fault";
             if (JSON.stringify(error.Fault).toLowerCase().includes("auth")) {
                 errorMsg = authFailedMessage;
                 isAuthFailure = true;
                 errorDataMsg = "Auth Failed";
             }
        } else {
             errorMsg = `API Error: ${error.message}`;
             errorDataMsg = `API Error: ${error.message.substring(0, 50)}`; // Truncate for data cell
        }
        console.log(`[${requestId}] Returning error fallback result due to catch block.`);
        return {
            headers: targetHeaders || [],
            data: createFallbackData(errorDataMsg, isAuthFailure),
            error: errorMsg // More detailed error message here
        };
    }
}


// ============================
// Specific Data Fetching Implementations
// ============================

async function getTradingAccounts(
    client: any,
    traderId: string,
): Promise<{ result: FetchResult; primaryAccount: string }> {
    const apiMethod = "TradAccounts";
    console.log(`---> Fetching ${apiMethod} for trader ${traderId}...`);
    const targetHeaders = ["Account", "Name", "Status", "Type", "Balance"];
    const keyMapping = KEY_MAPPINGS[apiMethod];
    let primaryAccount = DEFAULT_ACCOUNT_FALLBACK;

    // Consistent fallback creation
    const createFallback = (message: string, isAuthFail: boolean = false): FetchResult => ({
        headers: targetHeaders,
        data: [ isAuthFail ?
                [DEFAULT_ACCOUNT_FALLBACK, traderId, "Auth Failed", "N/A", "N/A"] :
                [message.substring(0,15), traderId, message.substring(0,15), "N/A", "N/A"]
              ],
        error: isAuthFail ? "Authentication Failed" : message
    });

    try {
        const params = { userName: traderId };
        console.log(`[${apiMethod}] Calling ${apiMethod}Async with params:`, params);
        const result = await client.TradAccountsAsync(params);
        const processed = await processAndUnzipResponse(apiMethod, result);

        if (processed?.trim().toLowerCase() === "not authorized") {
            console.error(`[${apiMethod}] Authentication failed for user ${traderId}.`);
            return { result: createFallback("Auth Failed", true), primaryAccount };
        }
        if (!processed) {
            console.warn(`[${apiMethod}] Processed response is null or empty for ${traderId}.`);
            // Treat no response for accounts as a potential issue, return AUTH_FAILED marker
            return { result: { headers: targetHeaders, data: [] }, primaryAccount };
        }

        const structuredData = parseResponseToStructure(apiMethod, processed, keyMapping);

        if (structuredData.length === 1 && structuredData[0]?.[keyMapping?.[0] ?? 'Error'] === "Not Authorized") {
             console.error(`[${apiMethod}] Auth failed (detected during parsing).`);
             return { result: createFallback("Auth Failed", true), primaryAccount: DEFAULT_ACCOUNT_FALLBACK };
        }
        if (structuredData.length === 1 && structuredData[0]?.error) {
             console.error(`[${apiMethod}] Parsing failed: ${structuredData[0].error}`);
             return { result: createFallback(`Parsing Failed: ${structuredData[0].error}`), primaryAccount: DEFAULT_ACCOUNT_FALLBACK };
        }

        const accountNumbers = extractAccountNumbers(structuredData, "AccountCode");

        if (accountNumbers.length > 0) {
            primaryAccount = accountNumbers[0];
            console.log(`[${apiMethod}] Primary account determined: ${primaryAccount}`);
            const dataOut: (string|null)[][] = structuredData.map((item) => [
                toStringSafe(item.AccountCode),
                toStringSafe(item.AccountTitle),
                toStringSafe(item.AccountStatus || "Active"),
                "Unknown",
                "PKR ?",
            ]);
            console.log(`[${apiMethod}] Success. Found ${dataOut.length} accounts.`);
            return {
                result: { headers: targetHeaders, data: dataOut },
                primaryAccount,
            };
        } else {
            console.warn(`[${apiMethod}] No valid account numbers extracted for ${traderId}.`);
            // Treat no accounts found (but no explicit auth error) as potential issue downstream
            return {
                result: { headers: targetHeaders, data: [] }, // Return empty data
                primaryAccount: DEFAULT_ACCOUNT_FALLBACK, // Keep fallback marker
            };
        }
    } catch (error: any) {
        console.error(`[${apiMethod}] CRITICAL ERROR for ${traderId}: ${error.message}`);
        console.error(error.stack);
        let errorMsg = `API Error: ${error.message}`;
        let isAuthFail = false;
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
            errorMsg = "SOAP Fault";
             if (JSON.stringify(error.Fault).toLowerCase().includes("auth")) {
                 isAuthFail = true;
                 errorMsg = "Authentication Failed";
             }
        }
        return { result: createFallback(errorMsg, isAuthFail), primaryAccount: DEFAULT_ACCOUNT_FALLBACK };
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
    const targetHeaders = [ "Order ID", "Symbol", "Side", "Type", "Quantity", "Price", "Status", "Date" ];
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

     const result = await standardFetch(client, apiMethod, params, targetHeaders, accountNo);

     if (result.data.length > 0 && !result.error) {
        const keyMapping = KEY_MAPPINGS[apiMethod];
        if (!keyMapping) {
             console.error(`[${apiMethod}] Key mapping missing, cannot reliably remap data.`);
             return result; // Return data as fetched by standardFetch
        }

        // Get indices safely
        const symbolIndex = keyMapping.indexOf("Symbol");
        const qtyIndex = keyMapping.indexOf("Quantity");
        const rateIndex = keyMapping.indexOf("Rate");
        const sideIndex = keyMapping.indexOf("Side");
        const typeIndex = keyMapping.indexOf("OrderType");
        const orderDateIndex = keyMapping.indexOf("OrderDate");
        const tradeDateIndex = keyMapping.indexOf("TradeDate");
        const refIndex = keyMapping.indexOf("Reference");

         const dataOut: (string | null)[][] = result.data.map((row, index) => {
             // Check if row is valid array before accessing
             if (!Array.isArray(row)) {
                 console.warn(`[${apiMethod}] Skipping invalid row item during post-processing:`, row);
                 return Array(targetHeaders.length).fill(null); // Return nulls if row format is wrong
             }
             const orderId = (refIndex !== -1 && refIndex < row.length) ? toStringSafe(row[refIndex]) : `OH-${index + 1}`;
             const status = "Completed";
             const orderDate = (orderDateIndex !== -1 && orderDateIndex < row.length) ? toStringSafe(row[orderDateIndex]) : "";
             const tradeDate = (tradeDateIndex !== -1 && tradeDateIndex < row.length) ? toStringSafe(row[tradeDateIndex]) : "";
             const date = orderDate || tradeDate;

             return [
                 orderId,
                 (symbolIndex !== -1 && symbolIndex < row.length) ? toStringSafe(row[symbolIndex]) : null,
                 (sideIndex !== -1 && sideIndex < row.length) ? toStringSafe(row[sideIndex]) : null,
                 (typeIndex !== -1 && typeIndex < row.length) ? toStringSafe(row[typeIndex]) : null,
                 (qtyIndex !== -1 && qtyIndex < row.length) ? toStringSafe(row[qtyIndex]) : null,
                 (rateIndex !== -1 && rateIndex < row.length) ? toStringSafe(row[rateIndex]) : null,
                 status,
                 date,
             ];
         });
         // Return the remapped data with the correct target headers
         return { headers: targetHeaders, data: dataOut };
     }

     // Return result from standardFetch if it had an error or no data
     return result;
}

async function getPositions(
    client: any,
    traderId: string,
    accountNo: string,
): Promise<FetchResult> {
    const apiMethod = "GetCollateral";
    const targetHeaders = [ "Symbol", "Quantity", "Avg Buy Rate", "MTM Rate", "Unsettled P/L", "Value After Haircut" ];
    const params = {
        UserID: traderId,
        Account: accountNo,
    };

     const result = await standardFetch(client, apiMethod, params, targetHeaders, accountNo);

     if (result.data.length > 0 && !result.error) {
         const keyMapping = KEY_MAPPINGS[apiMethod];
         if (!keyMapping) {
             console.error(`[${apiMethod}] Key mapping missing.`);
             return result;
         }

         const symbolIndex = keyMapping.indexOf("Symbol");
         const quantityIndex = keyMapping.indexOf("Quantity");
         const avgBuyIndex = keyMapping.indexOf("AvgBuyRate");
         const mtmRateIndex = keyMapping.indexOf("MTM_Rate");
         const unsettledPLIndex = keyMapping.indexOf("UnsettledPL");
         const valueHaircutIndex = keyMapping.indexOf("ValueAfterHaircut");

         const dataOut: (string | null)[][] = result.data.map(row => {
            if (!Array.isArray(row)) {
                 console.warn(`[${apiMethod}] Skipping invalid row item during post-processing:`, row);
                 return Array(targetHeaders.length).fill(null);
            }
             return [
                 (symbolIndex !== -1 && symbolIndex < row.length) ? toStringSafe(row[symbolIndex]) : null,
                 (quantityIndex !== -1 && quantityIndex < row.length) ? toStringSafe(row[quantityIndex]) : null,
                 (avgBuyIndex !== -1 && avgBuyIndex < row.length) ? toStringSafe(row[avgBuyIndex]) : null,
                 (mtmRateIndex !== -1 && mtmRateIndex < row.length) ? toStringSafe(row[mtmRateIndex]) : null,
                 (unsettledPLIndex !== -1 && unsettledPLIndex < row.length) ? toStringSafe(row[unsettledPLIndex]) : null,
                 (valueHaircutIndex !== -1 && valueHaircutIndex < row.length) ? toStringSafe(row[valueHaircutIndex]) : null,
             ];
         });
         return { headers: targetHeaders, data: dataOut };
     }

     return result;
}

async function getAccountStatement(
    client: any,
    traderId: string,
    accountNo: string,
    startDate = COMMON_START_DATE,
    endDate = COMMON_END_DATE,
): Promise<FetchResult> {
    const apiMethod = "GetAccountStatement";
    const targetHeaders = ["Voucher No", "Date", "Description", "Debit", "Credit", "Balance"];
    const params = {
        userName: traderId,
        accountNo: accountNo,
        startDate: startDate,
        endDate: endDate,
        from: "TradeCast",
    };

     const result = await standardFetch(client, apiMethod, params, targetHeaders, accountNo);

     if (result.data.length > 0 && !result.error) {
         const keyMapping = KEY_MAPPINGS[apiMethod];
         if (!keyMapping) {
             console.error(`[${apiMethod}] Key mapping missing.`);
             return result;
         }

         const voucherIndex = keyMapping.indexOf("VoucherNo");
         const dateIndex = keyMapping.indexOf("Date");
         const descIndex = keyMapping.indexOf("Description");
         const debitIndex = keyMapping.indexOf("Debit");
         const creditIndex = keyMapping.indexOf("Credit");
         const balanceIndex = keyMapping.indexOf("Balance");

         const dataOut: (string | null)[][] = result.data.map(row => {
             if (!Array.isArray(row)) {
                 console.warn(`[${apiMethod}] Skipping invalid row item during post-processing:`, row);
                 return Array(targetHeaders.length).fill(null);
             }
            return [
                 (voucherIndex !== -1 && voucherIndex < row.length) ? toStringSafe(row[voucherIndex]) : null,
                 (dateIndex !== -1 && dateIndex < row.length) ? toStringSafe(row[dateIndex]) : null,
                 (descIndex !== -1 && descIndex < row.length) ? toStringSafe(row[descIndex]) : null,
                 (debitIndex !== -1 && debitIndex < row.length) ? toStringSafe(row[debitIndex]) : null,
                 (creditIndex !== -1 && creditIndex < row.length) ? toStringSafe(row[creditIndex]) : null,
                 (balanceIndex !== -1 && balanceIndex < row.length) ? toStringSafe(row[balanceIndex]) : null,
             ];
         });
         return { headers: targetHeaders, data: dataOut };
     }

     return result;
}

async function getAccountInfo(
    client: any,
    traderId: string,
    accountNo: string,
): Promise<FetchResult> {
    const apiMethod = "GetExposureDynamic";
    const requestId = `${apiMethod}-${Date.now()}`; // Unique ID for this specific call instance
    console.log(
        `---> [${requestId}] Fetching Account Info (via ${apiMethod}) for trader ${traderId}, account ${accountNo}...`,
    );
    const targetHeaders = ["Detail", "Value"];

    // Consistent fallback creation
    const createFallback = (message: string, isAuthFail: boolean = false): FetchResult => ({
        headers: targetHeaders,
        data: [["Status", isAuthFail ? "Auth Failed" : message]],
        error: isAuthFail ? "Authentication Failed" : message
    });

    if (accountNo === DEFAULT_ACCOUNT_FALLBACK) {
        console.warn(`[${requestId}] Skipping API call due to previous authentication failure.`);
        return createFallback("Auth Failed", true);
    }

    const asyncMethodName = `${apiMethod}Async`;
    if (typeof client[asyncMethodName] !== "function") {
        const errorMsg = `API Method ${asyncMethodName} Unavailable`;
        console.error(`[${requestId}] ${errorMsg}`);
        return createFallback(errorMsg);
    }

    try {
        const params = { UserID: traderId, account: accountNo, approved: "0" };
        console.log(`[${requestId}] Calling ${asyncMethodName} with params:`, params);
        const result = await client[asyncMethodName](params);
        const processed = await processAndUnzipResponse(apiMethod, result); // Use base apiMethod for logging context

        if (processed?.trim().toLowerCase() === "not authorized") {
            console.error(`[${requestId}] Authentication failed for this call.`);
            return createFallback("Auth Failed", true);
        }
        if (!processed) {
            console.warn(`[${requestId}] Processed response is null or empty for ${traderId}.`);
            return createFallback("No details found");
        }

        const structuredData = parseExposureDynamic(apiMethod, processed); // Use base apiMethod for logging context

        if (structuredData.length === 1 && structuredData[0]?.Metric === "Error") {
             const errorMessage = structuredData[0]?.Value || "Unknown Error";
             const isAuthFail = errorMessage === "Not Authorized";
             console.error(`[${requestId}] Error detected during exposure parsing: ${errorMessage}`);
             return createFallback(`Error: ${errorMessage}`, isAuthFail);
        }
        if (structuredData.length === 1 && structuredData[0]?.error) {
             console.error(`[${requestId}] Parsing failed (fallback parser). Error: ${structuredData[0].error}`);
             return createFallback(`Parsing Failed: ${structuredData[0].error}`);
        }

        if (structuredData.length > 0) {
            const dataOut: (string | null)[][] = [["Account ID", accountNo]];

             const findMetricValue = (metricNamePattern: RegExp, marketKeyPattern: RegExp = /^REG$|^Regular$|^Cash$/i): string | null => {
                const metricRow = structuredData.find(item => typeof item === 'object' && item !== null && item.Metric && metricNamePattern.test(item.Metric));
                 if (!metricRow) return null;

                 let bestMatchKey: string | null = null;
                 for (const key in metricRow) {
                    if (key !== "Metric" && key && marketKeyPattern.test(key)) {
                         bestMatchKey = key;
                         break;
                     }
                 }
                 if (!bestMatchKey) {
                    for (const key in metricRow) {
                        if (key !== "Metric" && metricRow[key] !== null && metricRow[key] !== undefined && String(metricRow[key]).trim() !== "") {
                            bestMatchKey = key;
                            break;
                        }
                    }
                 }
                return bestMatchKey && Object.hasOwnProperty.call(metricRow, bestMatchKey) ? toStringSafe(metricRow[bestMatchKey]) : null;
            };

            const balance = findMetricValue(/^Floating_Balance/i);
            const cashValue = findMetricValue(/^~Cash/i);
            const allowedLimitReg = findMetricValue(/^Allowed_Limit/i, /^REG$|^Regular$|^Cash$/i);
            const availableAmtReg = findMetricValue(/^Available_Amount|^Available_Amt/i, /^REG$|^Regular$|^Cash$/i);
            const allowedLimitFut = findMetricValue(/^Allowed_Limit/i, /^FUT$|^Future$/i);
            const availableAmtFut = findMetricValue(/^Available_Amount|^Available_Amt/i, /^FUT$|^Future$/i);
            const exposure = findMetricValue(/^Exposure/i, /^FUT$|^Future$/i);
            const profitLoss = findMetricValue(/^Profit\/Loss/i, /^ODL/i);

            if (balance !== null) dataOut.push(["Floating Balance", balance]);
            if (cashValue !== null) dataOut.push(["Cash", cashValue]);
            if (allowedLimitReg !== null) dataOut.push(["Allowed Limit (REG)", allowedLimitReg]);
            if (availableAmtReg !== null) dataOut.push(["Available Amount (REG)", availableAmtReg]);
            if (allowedLimitFut !== null) dataOut.push(["Allowed Limit (FUT)", allowedLimitFut]);
            if (availableAmtFut !== null) dataOut.push(["Available Amount (FUT)", availableAmtFut]);
            if (exposure !== null) dataOut.push(["Exposure (FUT)", exposure]);
            if (profitLoss !== null) dataOut.push(["Profit/Loss (ODL)", profitLoss]);

            console.log(`[${requestId}] Success. Extracted ${dataOut.length - 1} details.`);
            return { headers: targetHeaders, data: dataOut };
        }

        console.warn(`[${requestId}] No valid account info found after parsing for ${traderId}.`);
        return createFallback("No details found");

    } catch (error: any) {
        console.error(`[${requestId}] CRITICAL ERROR for ${traderId}: ${error.message}`);
        console.error(error.stack);
        let errorMsg = `API Error: ${error.message}`;
        let isAuthFail = false;
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
             errorMsg = "SOAP Fault";
             if (JSON.stringify(error.Fault).toLowerCase().includes("auth")) {
                 isAuthFail = true;
                 errorMsg = "Authentication Failed";
             }
        }
        return createFallback(errorMsg, isAuthFail);
    }
}


// --- ADDED: Log Fetching Functions ---

async function getTradeLog(
    client: any,
    traderId: string,
    accountNo: string, // Pass accountNo for auth check context in standardFetch
): Promise<FetchResult> {
    const apiMethod = "GetTradeLog";
    const targetHeaders = KEY_MAPPINGS[apiMethod] || Array(17).fill(0).map((_, i) => `Col${i + 1}`);
    const params = {
        username: traderId,
    };
    return standardFetch(client, apiMethod, params, targetHeaders, accountNo);
}

async function getDailyActivityLog(
    client: any,
    traderId: string,
    accountNo: string,
): Promise<FetchResult> {
    const apiMethod = "GetDailyActivityLog";
    const targetHeaders = KEY_MAPPINGS[apiMethod] || Array(16).fill(0).map((_, i) => `Col${i + 1}`);
    const params = {
        username: traderId,
    };
    return standardFetch(client, apiMethod, params, targetHeaders, accountNo);
}

async function getOutstandingLog(
    client: any,
    traderId: string,
    accountNo: string,
): Promise<FetchResult> {
    const apiMethod = "GetOutstandingLog";
    const targetHeaders = KEY_MAPPINGS[apiMethod] || Array(13).fill(0).map((_, i) => `Col${i + 1}`);
    const params = {
        username: traderId,
    };
    return standardFetch(client, apiMethod, params, targetHeaders, accountNo);
}


// ============================
// Main Exported Functions
// ============================

interface AllAccountDetails {
    tradingAccounts: FetchResult;
    orderHistory: FetchResult;
    positions: FetchResult;
    accountInfo: FetchResult;
    accountStatement: FetchResult;
    tradeLogs: FetchResult;
    activityLogs: FetchResult;
    outstandingLogs: FetchResult;
    timestamp: string;
    dataSource: 'api' | 'api_with_errors' | 'error' | 'error_auth'; // Refined dataSource
}

async function fetchAllAccountDetails(
    traderUsername: string,
    traderPassword?: string, // Password often not needed directly for API calls if service auth works
): Promise<AllAccountDetails> {
    // Log received TRADER username (Avoid logging password)
    console.log(`Credentials received for AKD connection: {"username":"${traderUsername}"}`);
    const timestamp = new Date().toISOString();
    const requestId = `fetchAll-${Date.now()}`; // Unique ID for this request

    // Helper to create a default/error FetchResult structure
    const createDefaultFetchResult = (headers: string[] = ["Error"], message: string = "Error", isAuthFailure: boolean = false): FetchResult => {
        const safeHeaders = Array.isArray(headers) ? headers : ["Error"];
        const dataRow = Array(safeHeaders.length || 1).fill(isAuthFailure ? "Auth Failed" : message.substring(0, 50)); // Truncate message for cell
        return {
            headers: safeHeaders,
            data: [dataRow],
            error: isAuthFailure ? "Authentication Failed" : message,
        };
    };

    // Helper to safely get headers or provide a default
    const safeGetHeaders = (key: keyof typeof KEY_MAPPINGS | string, defaultHeaders: string[] = ["Error"]): string[] => {
         const mappedHeaders = KEY_MAPPINGS[key as keyof typeof KEY_MAPPINGS];
         return Array.isArray(mappedHeaders) ? mappedHeaders : defaultHeaders;
    }

    // Ensure required variables are present
    if (!traderUsername || !SERVICE_USERNAME || !SERVICE_PASSWORD) {
        console.error(`[${requestId}] Error: Missing Trader Credentials or Service Credentials.`);
        return {
            tradingAccounts: createDefaultFetchResult(safeGetHeaders('TradAccounts'), "Missing Credentials"),
            orderHistory: createDefaultFetchResult(safeGetHeaders('GetOrderHistory'), "Missing Credentials"),
            positions: createDefaultFetchResult(safeGetHeaders('GetCollateral'), "Missing Credentials"),
            accountInfo: createDefaultFetchResult(["Detail", "Value"], "Missing Credentials"),
            accountStatement: createDefaultFetchResult(["Voucher No", "Date", "Description", "Debit", "Credit", "Balance"], "Missing Credentials"),
            tradeLogs: createDefaultFetchResult(safeGetHeaders('GetTradeLog'), "Missing Credentials"),
            activityLogs: createDefaultFetchResult(safeGetHeaders('GetDailyActivityLog'), "Missing Credentials"),
            outstandingLogs: createDefaultFetchResult(safeGetHeaders('GetOutstandingLog'), "Missing Credentials"),
            timestamp,
            dataSource: "error",
        };
    }

    console.log(`Fetching AKD details for ${traderUsername}, request ID: ${requestId}, Time: ${timestamp}`);

    try {
        console.log(`[${requestId}] Attempting SOAP connection to ${WSDL_URL}...`);
        console.log(`   Service Username: ${SERVICE_USERNAME}`);

        const client = await soap.createClientAsync(WSDL_URL);
        client.setSecurity(new soap.BasicAuthSecurity(SERVICE_USERNAME, SERVICE_PASSWORD));
        console.log(`[${requestId}] SOAP client created and Service authentication set.`);

        // --- Get Trading Accounts (Crucial First Step) ---
        const { result: tradingAccountsResult, primaryAccount } = await getTradingAccounts(client, traderUsername);

        // --- CRITICAL AUTH CHECK ---
        const isAuthFailed = primaryAccount === DEFAULT_ACCOUNT_FALLBACK ||
                             tradingAccountsResult.error === "Authentication Failed" ||
                             (Array.isArray(tradingAccountsResult.data) && tradingAccountsResult.data[0]?.[0] === "Auth Failed");

        if (isAuthFailed) {
            console.error(`[${requestId}] Authentication failed for ${traderUsername} (detected via TradAccounts). Aborting further calls.`);
             const finalTradingAccounts = createDefaultFetchResult(safeGetHeaders('TradAccounts'), "Auth Failed", true);
            return {
                tradingAccounts: finalTradingAccounts,
                orderHistory: createDefaultFetchResult(safeGetHeaders('GetOrderHistory'), "Auth Failed", true),
                positions: createDefaultFetchResult(safeGetHeaders('GetCollateral'), "Auth Failed", true),
                accountInfo: createDefaultFetchResult(["Detail", "Value"], "Auth Failed", true),
                accountStatement: createDefaultFetchResult(["Voucher No", "Date", "Description", "Debit", "Credit", "Balance"], "Auth Failed", true),
                tradeLogs: createDefaultFetchResult(safeGetHeaders('GetTradeLog'), "Auth Failed", true),
                activityLogs: createDefaultFetchResult(safeGetHeaders('GetDailyActivityLog'), "Auth Failed", true),
                outstandingLogs: createDefaultFetchResult(safeGetHeaders('GetOutstandingLog'), "Auth Failed", true),
                timestamp,
                dataSource: "error_auth",
            };
        }
        console.log(`[${requestId}] Using primary account ${primaryAccount} for subsequent API calls.`);

        // --- Fetch other details IN PARALLEL using Promise.allSettled ---
        const results = await Promise.allSettled([
            getOrderHistory(client, traderUsername, primaryAccount),
            getPositions(client, traderUsername, primaryAccount),
            getAccountInfo(client, traderUsername, primaryAccount),
            getAccountStatement(client, traderUsername, primaryAccount),
            getTradeLog(client, traderUsername, primaryAccount),
            getDailyActivityLog(client, traderUsername, primaryAccount),
            getOutstandingLog(client, traderUsername, primaryAccount),
        ]);

        // --- Process results from Promise.allSettled ---
        const processSettledResult = (
            settledResult: PromiseSettledResult<FetchResult>,
            fallbackHeaders: string[],
            callName: string // For logging
         ): FetchResult => {
            if (settledResult.status === 'fulfilled') {
                 console.log(`[${requestId}] Call ${callName} fulfilled.`);
                 const value = settledResult.value;
                 // Validate the structure of the fulfilled value
                 if (typeof value === 'object' && value !== null && Array.isArray(value.headers) && Array.isArray(value.data)) {
                      return {
                         headers: value.headers,
                         data: value.data,
                         error: typeof value.error === 'string' ? value.error : undefined // Pass error if standardFetch returned one
                      };
                 } else {
                      console.error(`[${requestId}] Call ${callName} fulfilled but returned invalid structure:`, value);
                      return createDefaultFetchResult(fallbackHeaders, `Invalid Data Format from ${callName}`);
                 }
            } else {
                // Handle rejected promise
                console.error(`[${requestId}] Call ${callName} rejected:`, settledResult.reason);
                const errorMessage = settledResult.reason instanceof Error ? settledResult.reason.message : "Unknown API Call Error";
                // Check if rejection reason indicates auth failure (might come from standardFetch catch block)
                const isAuthFail = /auth failed/i.test(errorMessage);
                return createDefaultFetchResult(fallbackHeaders, `API Call Failed: ${errorMessage}`, isAuthFail);
            }
        };

        // Assign results after processing
        const orderHistory = processSettledResult(results[0], safeGetHeaders('GetOrderHistory'), 'getOrderHistory');
        const positions = processSettledResult(results[1], safeGetHeaders('GetCollateral'), 'getPositions');
        const accountInfo = processSettledResult(results[2], ["Detail", "Value"], 'getAccountInfo');
        const accountStatement = processSettledResult(results[3], ["Voucher No", "Date", "Description", "Debit", "Credit", "Balance"], 'getAccountStatement');
        const tradeLogs = processSettledResult(results[4], safeGetHeaders('GetTradeLog'), 'getTradeLog');
        const activityLogs = processSettledResult(results[5], safeGetHeaders('GetDailyActivityLog'), 'getDailyActivityLog');
        const outstandingLogs = processSettledResult(results[6], safeGetHeaders('GetOutstandingLog'), 'getOutstandingLog');


        // Determine overall status
        const allResults = [tradingAccountsResult, orderHistory, positions, accountInfo, accountStatement, tradeLogs, activityLogs, outstandingLogs];
        const hasErrors = allResults.some(res => !!res.error); // Check if any FetchResult has an error property set
        const finalDataSource: AllAccountDetails['dataSource'] = hasErrors ? 'api_with_errors' : 'api';

        console.log(`[${requestId}] Successfully finished fetching API data for ${traderUsername}. Overall status: ${finalDataSource}`);

        // --- DEBUG LOGGING for new log fetches ---
        console.log(`\n[${requestId}] --- DEBUG: Trade Logs Result ---`);
        console.log(JSON.stringify(tradeLogs, null, 2)?.substring(0, 1000) + '...');
        console.log(`--- END DEBUG: Trade Logs ---\n`);

        console.log(`\n[${requestId}] --- DEBUG: Activity Logs Result ---`);
        console.log(JSON.stringify(activityLogs, null, 2)?.substring(0, 1000) + '...');
        console.log(`--- END DEBUG: Activity Logs ---\n`);

        console.log(`\n[${requestId}] --- DEBUG: Outstanding Logs Result ---`);
        console.log(JSON.stringify(outstandingLogs, null, 2)?.substring(0, 1000) + '...');
        console.log(`--- END DEBUG: Outstanding Logs ---\n`);
        // --- END DEBUG LOGGING ---


        console.log(`[${requestId}] Account details structure summary: ${JSON.stringify({
            tradingAccounts: { headers: tradingAccountsResult.headers?.length, dataLength: tradingAccountsResult.data?.length, error: tradingAccountsResult.error },
            orderHistory: { headers: orderHistory.headers?.length, dataLength: orderHistory.data?.length, error: orderHistory.error },
            positions: { headers: positions.headers?.length, dataLength: positions.data?.length, error: positions.error },
            accountInfo: { headers: accountInfo.headers?.length, dataLength: accountInfo.data?.length, error: accountInfo.error },
            accountStatement: { headers: accountStatement.headers?.length, dataLength: accountStatement.data?.length, error: accountStatement.error },
            tradeLogs: { headers: tradeLogs.headers?.length, dataLength: tradeLogs.data?.length, error: tradeLogs.error },
            activityLogs: { headers: activityLogs.headers?.length, dataLength: activityLogs.data?.length, error: activityLogs.error },
            outstandingLogs: { headers: outstandingLogs.headers?.length, dataLength: outstandingLogs.data?.length, error: outstandingLogs.error },
        }, null, 2)}`);

        // Assemble the final result, ensuring all parts are valid FetchResult objects
        const finalDetails: AllAccountDetails = {
            tradingAccounts: tradingAccountsResult, // Already validated in its own function
            orderHistory,
            positions,
            accountInfo,
            accountStatement,
            tradeLogs,
            activityLogs,
            outstandingLogs,
            timestamp,
            dataSource: finalDataSource,
        };

         console.log(`[${requestId}] Returning final AllAccountDetails structure:`, JSON.stringify(finalDetails).substring(0, 1000) + "...");
        return finalDetails;

    } catch (error: any) {
        console.error(`[${requestId}] CRITICAL Error in fetchAllAccountDetails for ${traderUsername}: ${error.message}`);
        console.error(error.stack);
        let errorMessage = `API Failure: ${error.message}`;
        let isAuthFailure = false;
        if (error.Fault) {
            console.error("SOAP Fault:", JSON.stringify(error.Fault, null, 2));
             errorMessage = `SOAP Fault`;
             if (JSON.stringify(error.Fault).toLowerCase().includes("auth")) {
                 isAuthFailure = true;
                 errorMessage = "Authentication Failed";
             }
        }
        console.log(`[${requestId}] Returning ERROR structure due to top-level catch block.`);
        return {
             tradingAccounts: createDefaultFetchResult(safeGetHeaders('TradAccounts'), errorMessage, isAuthFailure),
             orderHistory: createDefaultFetchResult(safeGetHeaders('GetOrderHistory'), "API Failure"),
             positions: createDefaultFetchResult(safeGetHeaders('GetCollateral'), "API Failure"),
             accountInfo: createDefaultFetchResult(["Detail", "Value"], "API Failure"),
             accountStatement: createDefaultFetchResult(["Voucher No", "Date", "Description", "Debit", "Credit", "Balance"], "API Failure"),
             tradeLogs: createDefaultFetchResult(safeGetHeaders('GetTradeLog'), "API Failure"),
             activityLogs: createDefaultFetchResult(safeGetHeaders('GetDailyActivityLog'), "API Failure"),
             outstandingLogs: createDefaultFetchResult(safeGetHeaders('GetOutstandingLog'), "API Failure"),
             timestamp,
             dataSource: isAuthFailure ? "error_auth" : "error",
        };
    }
}

async function testConnection(
    traderUsername: string,
    traderPassword?: string, // Password often not needed here either
): Promise<boolean> {
    console.log(`Testing AKD connection for trader: ${traderUsername}`);

    if (!traderUsername || !SERVICE_USERNAME || !SERVICE_PASSWORD) {
        console.error("Test Connection Error: Missing Trader or Service credentials.");
        return false;
    }

    try {
        console.log(`Attempting SOAP connection using SERVICE credentials for test...`);
        console.log(`   Service Username: ${SERVICE_USERNAME}`);

        const client = await soap.createClientAsync(WSDL_URL);
        client.setSecurity(new soap.BasicAuthSecurity(SERVICE_USERNAME, SERVICE_PASSWORD));
        console.log("SOAP client created and Service authentication set for test.");

        // Use TradAccounts as the test call, as it's the first crucial step
        const apiMethod = "TradAccounts";
        const params = { userName: traderUsername }; // Match param name from getTradingAccounts
        console.log(`Calling ${apiMethod}Async for test with params:`, params);
        const result = await client.TradAccountsAsync(params);

        // Process the response to check for "Not Authorized" or other issues
        const processed = await processAndUnzipResponse(`${apiMethod}_Test`, result);

        // Check 1: Direct "Not Authorized" string
        if (processed?.trim().toLowerCase() === "not authorized") {
            console.error(`AKD connection test FAILED for ${traderUsername}: Service auth OK, but trader call returned 'Not Authorized'.`);
            return false;
        }

        // Check 2: Null/empty response (could be valid if user has no accounts, but treat as success for connection test)
        if (!processed) {
            console.warn(`AKD connection test WARNING for ${traderUsername}: Service auth OK, but trader call returned empty/null response. Assuming connection OK.`);
            return true; // Connection itself worked
        }

         // Check 3: Parse and look for structured "Not Authorized" or errors
         const keyMapping = KEY_MAPPINGS[apiMethod];
         const structuredData = parseResponseToStructure(`${apiMethod}_Test`, processed, keyMapping);

         const firstKey = keyMapping ? keyMapping[0] : "Error";
         if (structuredData.length === 1 && structuredData[0]?.[firstKey] === "Not Authorized") {
             console.error(`AKD connection test FAILED for ${traderUsername}: Service auth OK, but trader call resulted in parsed 'Not Authorized'.`);
             return false;
         }
          if (structuredData.length === 1 && structuredData[0]?.error) {
             console.error(`AKD connection test FAILED for ${traderUsername}: Service auth OK, but trader call response parsing failed: ${structuredData[0].error}`);
             return false;
          }

        // If none of the failure conditions were met, the connection and basic call worked.
        console.log(`AKD connection test successful for ${traderUsername}.`);
        return true;

    } catch (error: any) {
         console.error(`AKD connection test FAILED for ${traderUsername}: ${error.message}`);
         if (error.Fault) {
             // Check if the fault specifically indicates service authentication failure
             const faultString = JSON.stringify(error.Fault).toLowerCase();
             if (faultString.includes("authentication failed") || faultString.includes("unauthorized") || faultString.includes("credentials")) {
                  console.error("SOAP Fault indicates SERVICE authentication failure.");
             } else {
                 console.error("SOAP Fault details:", JSON.stringify(error.Fault, null, 2));
             }
         } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT') || error.message.includes('ENOTFOUND')) {
             console.error(`Network error connecting to WSDL ${WSDL_URL}: ${error.message}`);
         }
         return false; // Any exception means the test failed
    }
}

// --- Exports ---
const getAllAccountDetails = fetchAllAccountDetails;
export { getAllAccountDetails, testConnection };
export type { AllAccountDetails, FetchResult }; // Export types if needed externally
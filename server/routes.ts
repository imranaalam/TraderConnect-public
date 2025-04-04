import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { connectionRequestSchema, connectionTestSchema, ConnectionTest, Connection } from "@shared/schema";
import { z } from "zod";
// Removed unused crypto imports: import { scrypt, createHash } from 'crypto';
// Removed unused axios import: import axios from 'axios';
import { testConnection as testAKDAPI, getAllAccountDetails as getAKDDetails, AllAccountDetails, FetchResult } from './brokers/akdApiClient'; // Import types

// Connection test implementation functions
async function testAKDConnection(credentials: Record<string, string>): Promise<boolean> {
  // Validate required credentials for AKD
  // AKD testConnection likely only needs username based on your client implementation
  if (!credentials.username) {
    console.error('AKD test connection error: Missing username');
    throw new Error('Missing required credentials for AKD: username is required');
  }

  try {
    console.log(`Attempting to test connect to AKD using username: ${credentials.username}`);

    // Use the imported testConnection function from the AKD API client
    // Pass password even if not strictly used by testConnection, for consistency
    const connectionResult = await testAKDAPI(credentials.username, credentials.password);

    if (connectionResult) {
      console.log(`AKD test connection successful for username: ${credentials.username}`);
      return true;
    }

    console.warn(`AKD test connection failed for username: ${credentials.username}`);
    throw new Error('Connection failed. Please verify your credentials.');
  } catch (error: any) {
    console.error('AKD connection test error:', error);
    throw new Error(`AKD API connection failed: ${error.message}`);
  }
}

async function testMKKConnection(credentials: Record<string, string>): Promise<boolean> {
  // Validate required credentials for MKK
  if (!credentials.accountId || !credentials.password) {
    throw new Error('Missing required credentials for MKK: accountId and password are required');
  }

  // Simulate MKK authentication - in production this would call their actual API
  if (credentials.accountId.startsWith('MKK') && credentials.password.length >= 6) {
    // Simulate successful connection
    return true;
  }

  throw new Error('Invalid credentials for MKK. Please check your account ID and password.');
}

async function testZerodhaConnection(credentials: Record<string, string>): Promise<boolean> {
  // Validate required credentials for Zerodha
  if (credentials.authMethod === 'api') {
    if (!credentials.apiKey || !credentials.apiSecret) {
      throw new Error('Missing required API credentials for Zerodha: apiKey and apiSecret are required');
    }

    // Simulate API key validation
    if (credentials.apiKey.length >= 8 && credentials.apiSecret.length >= 8) {
      return true;
    }
  } else {
    if (!credentials.userId || !credentials.password || !credentials.pin) {
      throw new Error('Missing required credentials for Zerodha: userId, password, and pin are required');
    }

    // Simulate credential validation
    if (credentials.userId.length >= 6 && credentials.password.length >= 6) {
      return true;
    }
  }

  throw new Error('Invalid credentials for Zerodha. Authentication failed.');
}

async function testBinanceConnection(credentials: Record<string, string>): Promise<boolean> {
  // Validate required API credentials for Binance
  if (!credentials.apiKey || !credentials.apiSecret) {
    throw new Error('Missing required API credentials for Binance: apiKey and apiSecret are required');
  }

  // Simulate API key validation with Binance
  // In production, this would make an authenticated request to Binance API
  if (credentials.apiKey.length >= 8 && credentials.apiSecret.length >= 8) {
    try {
      // Simulate API call with an artificial delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // For demo, consider specific credentials valid and others invalid
      if (credentials.apiKey.startsWith('DEMO')) {
        return true;
      }

      throw new Error('Invalid API key format');
    } catch (error: any) {
      throw new Error(`Binance API connection failed: ${error.message}`);
    }
  }

  throw new Error('Invalid API credentials for Binance. Keys too short or malformed.');
}

async function testGenericConnection(connectionData: ConnectionTest): Promise<boolean> {
  // Generic test for other connections not specifically implemented
  // In a real application, this would attempt to connect based on the exchange/broker type

  // For demo purposes, just validate that credentials exist
  const { credentials } = connectionData;

  if (Object.keys(credentials).length === 0) {
    throw new Error('No credentials provided for connection test');
  }

  // Simulate successful generic connection if there are credentials
  return true;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Exchange and broker routes
  app.get("/api/exchanges", async (req, res, next) => {
    try {
      const exchanges = await storage.getAllExchanges();
      res.json(exchanges);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/exchanges/:marketType", async (req, res, next) => {
    try {
      const { marketType } = req.params;
      const exchanges = await storage.getExchangesByMarketType(marketType);
      res.json(exchanges);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/brokers/:exchangeId", async (req, res, next) => {
    try {
      const exchangeId = parseInt(req.params.exchangeId);
      if (isNaN(exchangeId)) {
           return res.status(400).json({ message: "Invalid exchange ID" });
      }
      const brokers = await storage.getBrokersByExchangeId(exchangeId);
      res.json(brokers);
    } catch (error) {
      next(error);
    }
  });

  // Connection routes
  app.post("/api/connections", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Ensure req.user is defined after authentication middleware
    if (!req.user || !req.user.id) {
        console.error('Authentication error: req.user or req.user.id is undefined');
        return res.status(500).json({ message: "Authentication error" });
    }

    try {
      const validatedData = connectionRequestSchema.parse(req.body);

      // Check if this connection already exists for the user
      const userConnections = await storage.getConnectionsByUserId(req.user!.id);
      const existingConnection = userConnections.find(conn =>
        conn.exchangeId === validatedData.exchangeId &&
        conn.brokerId === validatedData.brokerId
      );

      let connection;

      if (existingConnection) {
        // Update existing connection instead of creating a new one
        console.log(`Updating existing connection with ID ${existingConnection.id} for user ${req.user!.id}`);
        connection = await storage.updateConnection(existingConnection.id, {
          authMethod: validatedData.authMethod,
          credentials: validatedData.credentials,
          lastConnected: new Date().toISOString(),
          isActive: true
        });
      } else {
        // Create new connection
        console.log(`Creating new connection for user ${req.user!.id}`);
        connection = await storage.createConnection({
          userId: req.user!.id,
          exchangeId: validatedData.exchangeId,
          brokerId: validatedData.brokerId,
          authMethod: validatedData.authMethod,
          credentials: validatedData.credentials,
          lastConnected: new Date().toISOString(),
          isActive: true,
          isDefault: false // Not default by default
        });
      }

      res.status(201).json(connection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Connection validation error:", error.errors);
        return res.status(400).json({
          message: "Invalid connection data",
          errors: error.errors
        });
      }
      next(error);
    }
  });

  app.get("/api/connections", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.user || !req.user.id) {
        console.error('Authentication error: req.user or req.user.id is undefined');
        return res.status(500).json({ message: "Authentication error" });
    }

    try {
      const connections = await storage.getConnectionsByUserId(req.user!.id);
      res.json(connections);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/connections/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.user || !req.user.id) {
        console.error('Authentication error: req.user or req.user.id is undefined');
        return res.status(500).json({ message: "Authentication error" });
    }

    try {
      const id = parseInt(req.params.id);
       if (isNaN(id)) {
           return res.status(400).json({ message: "Invalid connection ID" });
       }
      const connection = await storage.getConnection(id);

      // Check if connection belongs to current user
      if (!connection || connection.userId !== req.user!.id) {
        return res.status(404).json({ message: "Connection not found" });
      }

      res.json(connection);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/connections/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
     if (!req.user || !req.user.id) {
         console.error('Authentication error: req.user or req.user.id is undefined');
         return res.status(500).json({ message: "Authentication error" });
     }

    try {
      const id = parseInt(req.params.id);
       if (isNaN(id)) {
           return res.status(400).json({ message: "Invalid connection ID" });
       }
      const connection = await storage.getConnection(id);

      // Check if connection belongs to current user
      if (!connection || connection.userId !== req.user!.id) {
        return res.status(404).json({ message: "Connection not found" });
      }

      await storage.deleteConnection(id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Update connection endpoint
  app.patch("/api/connections/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.user || !req.user.id) {
        console.error('Authentication error: req.user or req.user.id is undefined');
        return res.status(500).json({ message: "Authentication error" });
    }

    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
           return res.status(400).json({ message: "Invalid connection ID" });
       }
      const connection = await storage.getConnection(id);

      // Check if connection belongs to current user
      if (!connection || connection.userId !== req.user!.id) {
        return res.status(404).json({ message: "Connection not found" });
      }

      // Update only allowed fields
      const updates: Partial<Connection> = {};

      // Basic validation for credentials if provided
      if (req.body.credentials && typeof req.body.credentials === 'object') {
        updates.credentials = req.body.credentials;
         // Update lastConnected timestamp if credentials were changed
         updates.lastConnected = new Date().toISOString();
      }

      // Note: accountId is usually derived, not directly updated by user
      // if (req.body.accountId !== undefined) {
      //   updates.accountId = req.body.accountId;
      // }

      if (typeof req.body.isActive === 'boolean') {
        updates.isActive = req.body.isActive;
      }

      if (typeof req.body.isDefault === 'boolean') {
        updates.isDefault = req.body.isDefault;

        // If setting this connection as default, unset any other default connections
        // for the same exchange or broker
        if (req.body.isDefault) {
          const userConnections = await storage.getConnectionsByUserId(req.user!.id);

          for (const conn of userConnections) {
            if (conn.id !== id && conn.isDefault &&
                ((conn.exchangeId === connection.exchangeId) ||
                 (conn.brokerId && conn.brokerId === connection.brokerId))) {
              await storage.updateConnection(conn.id, { isDefault: false });
            }
          }
        }
      }

      if (Object.keys(updates).length === 0) {
           return res.status(400).json({ message: "No valid fields provided for update." });
      }

      const updatedConnection = await storage.updateConnection(id, updates);

      res.status(200).json(updatedConnection);
    } catch (error) {
      next(error);
    }
  });

  // Set a connection as default
  app.post("/api/connections/:id/set-default", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.user || !req.user.id) {
        console.error('Authentication error: req.user or req.user.id is undefined');
        return res.status(500).json({ message: "Authentication error" });
    }

    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
           return res.status(400).json({ message: "Invalid connection ID" });
       }
      const connection = await storage.getConnection(id);

      // Check if connection belongs to current user
      if (!connection || connection.userId !== req.user!.id) {
        return res.status(404).json({ message: "Connection not found" });
      }

      // Get all user connections to update default status
      const userConnections = await storage.getConnectionsByUserId(req.user!.id);

      // First, set all connections of the same exchange/broker type to non-default
      for (const conn of userConnections) {
        if (conn.id !== id && conn.isDefault &&
            ((conn.exchangeId === connection.exchangeId) ||
             (conn.brokerId && conn.brokerId === connection.brokerId))) {
          await storage.updateConnection(conn.id, { isDefault: false });
        }
      }

      // Then set this connection as default
      const updatedConnection = await storage.updateConnection(id, { isDefault: true });

      console.log(`Set connection ${id} as default for user ${req.user!.id}`);
      res.status(200).json(updatedConnection);
    } catch (error) {
      console.error('Error setting default connection:', error);
      next(error);
    }
  });

  // Test connection endpoint
  app.post("/api/test-connection", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const connectionData = connectionTestSchema.parse(req.body);

      // Get broker and exchange details
      const exchange = await storage.getExchange(connectionData.exchangeId);
      let broker = null;

      if (connectionData.brokerId) {
        broker = await storage.getBroker(connectionData.brokerId);
      }

      // Test the connection based on broker/exchange
      let testResult = false;
      let errorMessage = null;

      try {
        // Use broker?.name for safer access
        if (broker?.name === 'AKD') {
          testResult = await testAKDConnection(connectionData.credentials);
        } else if (broker?.name === 'MKK') {
          testResult = await testMKKConnection(connectionData.credentials);
        } else if (broker?.name === 'Zerodha') {
          testResult = await testZerodhaConnection(connectionData.credentials);
        } else if (exchange?.name === 'Binance') { // Check exchange if broker is null
          testResult = await testBinanceConnection(connectionData.credentials);
        } else {
          // Generic test for other connections
          console.log(`Performing generic connection test for exchangeId: ${connectionData.exchangeId}, brokerId: ${connectionData.brokerId}`);
          testResult = await testGenericConnection(connectionData);
        }
      } catch (testError: any) {
        console.error('Connection test error:', testError);
        errorMessage = testError.message;
      }

      if (testResult) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          message: errorMessage || 'Connection test failed'
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Connection test validation error:", error.errors);
        return res.status(400).json({
          message: "Invalid connection test data",
          errors: error.errors
        });
      }
      next(error);
    }
  });

  // Account Details Endpoints
  app.get("/api/account-details/:connectionId", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.user || !req.user.id) {
        console.error('Authentication error: req.user or req.user.id is undefined');
        return res.status(500).json({ message: "Authentication error" });
    }

    try {
      const connectionId = parseInt(req.params.connectionId);
      if (isNaN(connectionId)) {
           return res.status(400).json({ message: "Invalid connection ID" });
      }
      const connection = await storage.getConnection(connectionId);

      // Check if connection belongs to current user
      if (!connection || connection.userId !== req.user!.id) {
        return res.status(404).json({ message: "Connection not found" });
      }

      // Get broker details
      const exchange = await storage.getExchange(connection.exchangeId);
      let broker = null;
      if (connection.brokerId) {
        broker = await storage.getBroker(connection.brokerId);
      }

      let accountDetails: AllAccountDetails | object; // Use specific type or generic object

      // Based on broker, fetch the appropriate account details
      if (broker?.name === 'AKD') {
        accountDetails = await getAKDAccountDetails(connection); // Pass the full connection object
      } else if (broker?.name === 'MKK') {
        accountDetails = { message: "MKK account details not yet implemented" };
      } else if (broker?.name === 'Zerodha') {
        accountDetails = { message: "Zerodha account details not yet implemented" };
      } else if (exchange?.name === 'Binance') { // Check exchange if broker is null
        accountDetails = { message: "Binance account details not yet implemented" };
      } else {
        accountDetails = { message: "Account details not available for this connection type" };
      }

      // Send back the details
      res.json(accountDetails);

    } catch (error: any) { // Catch specific errors if possible
      console.error(`Error fetching account details for connection ${req.params.connectionId}:`, error);
       // Check if the error came from our AKD client and indicates auth failure
       if (error.message && /auth failed/i.test(error.message)) {
           return res.status(401).json({ message: "Authentication failed with the broker." });
       }
       // Avoid sending detailed internal errors to client
      next(new Error("Failed to fetch account details due to an internal error."));
    }
  });

  // ************************************************
  // ****** NEW ROUTE: Fetch Account Logs **********
  // ************************************************
  app.get("/api/account-logs/:connectionId", async (req, res, next) => {
    console.log(`Received request for /api/account-logs/${req.params.connectionId}`); // Log request entry
    if (!req.isAuthenticated()) {
      console.log("Log request failed: User not authenticated");
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.user || !req.user.id) {
      console.error('Authentication error in /api/account-logs: req.user or req.user.id is undefined');
      return res.status(500).json({ message: "Authentication error" });
    }

    try {
      const connectionId = parseInt(req.params.connectionId);
      if (isNaN(connectionId)) {
        console.log(`Log request failed: Invalid connection ID ${req.params.connectionId}`);
        return res.status(400).json({ message: "Invalid connection ID" });
      }
      console.log(`Fetching connection ${connectionId} for logs request.`);
      const connection = await storage.getConnection(connectionId);

      // Check if connection belongs to current user
      if (!connection || connection.userId !== req.user!.id) {
        console.log(`Log request failed: Connection ${connectionId} not found or doesn't belong to user ${req.user.id}`);
        return res.status(404).json({ message: "Connection not found" });
      }

      // Get broker details to determine the type
      let broker = null;
      if (connection.brokerId) {
        broker = await storage.getBroker(connection.brokerId);
      }

      // Check if it's an AKD connection
      if (broker?.name === 'AKD') {
        console.log(`Connection ${connectionId} identified as AKD. Fetching logs...`);
        // Fetch ALL details using the existing function (which includes logs)
        // We pass the full connection object which contains credentials
        const allDetails = await getAKDAccountDetails(connection);

        // Check if fetching failed (indicated by dataSource or error property)
         if (allDetails.dataSource?.startsWith('error') || (allDetails as any).error) {
             const errorMessage = (allDetails as any).error || "Failed to fetch log data from AKD";
             console.error(`Failed to fetch AKD logs for connection ${connectionId}:`, errorMessage);
             const status = allDetails.dataSource === 'error_auth' ? 401 : 500;
             return res.status(status).json({
                 error: errorMessage,
                 // Optionally include minimal log structure with error message
                 tradeLogs: { headers: ["Error"], data: [[errorMessage]], error: errorMessage },
                 activityLogs: { headers: ["Error"], data: [[errorMessage]], error: errorMessage },
                 outstandingLogs: { headers: ["Error"], data: [[errorMessage]], error: errorMessage }
             });
         }


        // Extract only the log data for the response
        const logData = {
          tradeLogs: allDetails.tradeLogs,
          activityLogs: allDetails.activityLogs,
          outstandingLogs: allDetails.outstandingLogs
        };

        console.log(`Successfully fetched AKD logs for connection ${connectionId}. Returning log data.`);
        // Return JUST the log data as JSON
        res.json(logData);

      } else {
        // Handle other broker types or connections without a broker
        const brokerName = broker?.name || 'Unknown Broker';
        console.log(`Log request for connection ${connectionId}: Broker type '${brokerName}' not supported for logs.`);
        res.status(400).json({ message: `Log fetching not implemented for ${brokerName}` });
      }

    } catch (error: any) {
      console.error(`Error fetching account logs for connection ${req.params.connectionId}:`, error);
      // Check if the error came from AKD client and indicates auth failure
      if (error.message && /auth failed/i.test(error.message)) {
          return res.status(401).json({ error: "Authentication failed with the broker when fetching logs." });
      }
      // Avoid sending detailed internal errors to client
      next(new Error("Failed to fetch account logs due to an internal error.")); // Use Express error handling
    }
  });
  // ************************************************
  // ****** END NEW ROUTE ***************************
  // ************************************************


  // Implementation of AKD account details using the SOAP API client
  // Modified to accept the full Connection object
  async function getAKDAccountDetails(connection: Connection): Promise<AllAccountDetails> {
     const credentials = connection.credentials as Record<string, string>;
     const logPrefix = `[AKD Details ConnId: ${connection.id}]`; // Prefix for logs

    try {
      console.log(`${logPrefix} Credentials received for AKD connection:`, JSON.stringify({
        username: credentials.username,
        password: credentials.password ? '******' : 'missing',
        // fields: Object.keys(credentials) // Can be verbose
      }));

      // Check if we have the minimum required credentials
      if (!credentials.username) { // Password might not be strictly needed for *all* calls if service auth works
        console.error(`${logPrefix} Missing required username credential for AKD`);
        throw new Error('Missing required username credential for AKD');
      }

      // Request ID for underlying API call
      const requestId = Date.now();
      console.log(`${logPrefix} Fetching AKD details for ${credentials.username}, underlying request ID: ${requestId}`);

      // Use our AKD API client to fetch real account details
      // Pass password even if potentially unused by some calls in client
      const accountDetails = await getAKDDetails(credentials.username, credentials.password);

      // Log the data source from the client
       console.log(`${logPrefix} Data source reported by AKD client: ${accountDetails.dataSource}`);
       if (accountDetails.dataSource?.startsWith('error')) {
            console.warn(`${logPrefix} AKD client indicated an error state: ${accountDetails.dataSource}. Error: ${JSON.stringify(accountDetails.tradingAccounts.error)}`);
            // Propagate the error information within the returned structure
             // No need to throw here, return the structure containing error info
       } else {
           console.log(`${logPrefix} Successfully fetched actual AKD data for ${credentials.username}`);
       }


      // Log a summary of the details structure for debugging
      console.log(`${logPrefix} Account details summary:`, JSON.stringify({
        dataSource: accountDetails.dataSource,
        tradingAccounts: { headers: accountDetails.tradingAccounts?.headers?.length, dataLength: accountDetails.tradingAccounts?.data?.length, error: accountDetails.tradingAccounts?.error },
        orderHistory: { headers: accountDetails.orderHistory?.headers?.length, dataLength: accountDetails.orderHistory?.data?.length, error: accountDetails.orderHistory?.error },
        positions: { headers: accountDetails.positions?.headers?.length, dataLength: accountDetails.positions?.data?.length, error: accountDetails.positions?.error },
        accountInfo: { headers: accountDetails.accountInfo?.headers?.length, dataLength: accountDetails.accountInfo?.data?.length, error: accountDetails.accountInfo?.error },
        accountStatement: { headers: accountDetails.accountStatement?.headers?.length, dataLength: accountDetails.accountStatement?.data?.length, error: accountDetails.accountStatement?.error },
        tradeLogs: { headers: accountDetails.tradeLogs?.headers?.length, dataLength: accountDetails.tradeLogs?.data?.length, error: accountDetails.tradeLogs?.error },
        activityLogs: { headers: accountDetails.activityLogs?.headers?.length, dataLength: accountDetails.activityLogs?.data?.length, error: accountDetails.activityLogs?.error },
        outstandingLogs: { headers: accountDetails.outstandingLogs?.headers?.length, dataLength: accountDetails.outstandingLogs?.data?.length, error: accountDetails.outstandingLogs?.error },
      }, null, 2));

      // Return the complete account details structure
      return accountDetails;

    } catch (error: any) {
      console.error(`${logPrefix} AKD account details fetch CRITICAL error:`, error);
       // Throw a new error to be caught by the route handler, potentially including auth info
       const errorMessage = `Failed to fetch AKD account details: ${error.message}`;
       if (error.message && /auth failed/i.test(error.message)) {
           throw new Error("Authentication Failed with AKD Broker"); // More specific error
       }
      throw new Error(errorMessage);
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
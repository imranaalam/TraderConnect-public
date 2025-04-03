import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { connectionRequestSchema, connectionTestSchema, ConnectionTest, Connection } from "@shared/schema";
import { z } from "zod";
import { scrypt, createHash } from 'crypto';
import { promisify } from 'util';
import axios from 'axios';

// Connection test implementation functions
async function testAKDConnection(credentials: Record<string, string>): Promise<boolean> {
  // Validate required credentials for AKD based on their API from Python code
  if (!credentials.username || !credentials.password) {
    throw new Error('Missing required credentials for AKD: username and password are required');
  }
  
  // Optional PIN code for extra authentication
  const pincode = credentials.pin || '';
  
  try {
    // In a real implementation, this would use axios to make SOAP requests to:
    // const WSDL_URL = "http://online.akdtrade.biz/TradeCastService/LoginServerService?wsdl";
    
    console.log(`Attempting to connect to AKD using username: ${credentials.username}`);
    
    // Simulate SOAP API call to TradAccounts endpoint
    // This is based on the Python implementation in the provided file
    const params = { userName: credentials.username };
    
    // Simulate successful connection for "jawadfoq" (from the Python script)
    // or "demo_akd" for ease of testing
    if (credentials.username === 'jawadfoq' || credentials.username === 'demo_akd') {
      // This would normally check password against the actual API
      return true;
    }
    
    // In production, this would check specific error codes from the SOAP response
    throw new Error('Invalid username for AKD. Please verify your credentials.');
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

    try {
      const validatedData = connectionRequestSchema.parse(req.body);
      
      // Create connection for the authenticated user
      const connection = await storage.createConnection({
        userId: req.user!.id,
        exchangeId: validatedData.exchangeId,
        brokerId: validatedData.brokerId,
        authMethod: validatedData.authMethod,
        credentials: validatedData.credentials,
        lastConnected: new Date().toISOString(),
      });

      res.status(201).json(connection);
    } catch (error) {
      if (error instanceof z.ZodError) {
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

    try {
      const id = parseInt(req.params.id);
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

    try {
      const id = parseInt(req.params.id);
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

    try {
      const id = parseInt(req.params.id);
      const connection = await storage.getConnection(id);
      
      // Check if connection belongs to current user
      if (!connection || connection.userId !== req.user!.id) {
        return res.status(404).json({ message: "Connection not found" });
      }
      
      // Update only allowed fields
      const updates: Partial<Connection> = {};
      
      if (req.body.credentials) {
        updates.credentials = req.body.credentials;
      }
      
      if (req.body.accountId !== undefined) {
        updates.accountId = req.body.accountId;
      }
      
      if (req.body.isActive !== undefined) {
        updates.isActive = req.body.isActive;
      }
      
      const updatedConnection = await storage.updateConnection(id, updates);
      
      // Update lastConnected timestamp if credentials were changed
      if (req.body.credentials) {
        const timestamp = new Date().toISOString();
        await storage.updateConnection(id, { lastConnected: timestamp });
      }
      
      res.status(200).json(updatedConnection);
    } catch (error) {
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
        if (broker && broker.name === 'AKD') {
          // Test AKD broker connection
          testResult = await testAKDConnection(connectionData.credentials);
        } else if (broker && broker.name === 'MKK') {
          // Test MKK broker connection
          testResult = await testMKKConnection(connectionData.credentials);
        } else if (broker && broker.name === 'Zerodha') {
          // Test Zerodha broker connection
          testResult = await testZerodhaConnection(connectionData.credentials);
        } else if (exchange && exchange.name === 'Binance') {
          // Test Binance exchange direct connection
          testResult = await testBinanceConnection(connectionData.credentials);
        } else {
          // Generic test for other connections
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
    
    try {
      const connectionId = parseInt(req.params.connectionId);
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
      
      let accountDetails = null;
      
      // Based on broker, fetch the appropriate account details
      if (broker?.name === 'AKD') {
        accountDetails = await getAKDAccountDetails(connection.credentials as Record<string, string>);
      } else if (broker?.name === 'MKK') {
        accountDetails = { message: "MKK account details not yet implemented" };
      } else if (broker?.name === 'Zerodha') {
        accountDetails = { message: "Zerodha account details not yet implemented" };
      } else if (exchange?.name === 'Binance') {
        accountDetails = { message: "Binance account details not yet implemented" };
      } else {
        accountDetails = { message: "Account details not available for this connection type" };
      }
      
      res.json(accountDetails);
    } catch (error) {
      console.error('Error fetching account details:', error);
      next(error);
    }
  });
  
  // Mock implementation of AKD account details based on the Python code
  async function getAKDAccountDetails(credentials: Record<string, string>) {
    try {
      // Check if we have the minimum required credentials
      if (!credentials.username || !credentials.password) {
        throw new Error('Missing required credentials for AKD');
      }
      
      // If this is the demo account "jawadfoq" or our test account, return sample data
      if (credentials.username === 'jawadfoq' || credentials.username === 'demo_akd') {
        // Mock data based on the Python script sample output
        return {
          tradingAccounts: {
            headers: ["Account", "Name", "Status", "Type", "Balance"],
            data: [
              ["COAF3906", "Jawad Foqan", "Active", "Cash", "PKR 587,210.45"],
              ["COAF3907", "Jawad Foqan", "Active", "Margin", "PKR 123,456.78"]
            ]
          },
          orderHistory: {
            headers: ["Order ID", "Symbol", "Side", "Type", "Quantity", "Price", "Status", "Date"],
            data: [
              ["ORD001", "MARI", "Buy", "Limit", "100", "PKR 1,234.56", "Completed", "2025-03-01"],
              ["ORD002", "ENGRO", "Sell", "Market", "50", "PKR 987.65", "Completed", "2025-03-02"],
              ["ORD003", "LUCK", "Buy", "Limit", "75", "PKR 567.89", "Rejected", "2025-03-03"]
            ]
          },
          accountStatement: {
            headers: ["Date", "Description", "Debit", "Credit", "Balance"],
            data: [
              ["2025-03-01", "Deposit", "", "PKR 100,000.00", "PKR 100,000.00"],
              ["2025-03-02", "Buy MARI x100", "PKR 123,456.00", "", "PKR -23,456.00"],
              ["2025-03-03", "Sell ENGRO x50", "", "PKR 49,382.50", "PKR 25,926.50"],
              ["2025-03-04", "Dividend MARI", "", "PKR 5,000.00", "PKR 30,926.50"]
            ]
          },
          portfolioHoldings: {
            headers: ["Symbol", "Quantity", "Avg Price", "Current Price", "Market Value", "Profit/Loss"],
            data: [
              ["MARI", "100", "PKR 1,234.56", "PKR 1,345.67", "PKR 134,567.00", "+PKR 11,111.00 (9.0%)"],
              ["LUCK", "75", "PKR 567.89", "PKR 598.76", "PKR 44,907.00", "+PKR 2,315.25 (5.4%)"]
            ]
          },
          marginDetails: {
            headers: ["Particular", "Value"],
            data: [
              ["Available Margin", "PKR 587,210.45"],
              ["Used Margin", "PKR 179,474.00"],
              ["Margin Call Level", "70%"],
              ["Current Margin Usage", "23.4%"]
            ]
          }
        };
      }
      
      // For other users, return a placeholder indicating real API call would be made
      throw new Error('Invalid username for AKD or real API connection required');
    } catch (error: any) {
      console.error('AKD account details error:', error);
      throw new Error(`Failed to fetch AKD account details: ${error.message}`);
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}

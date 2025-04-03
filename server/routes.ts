import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { connectionRequestSchema, connectionTestSchema, ConnectionTest, Connection } from "@shared/schema";
import { z } from "zod";
import { scrypt, createHash } from 'crypto';
import { promisify } from 'util';
import axios from 'axios';
import { testConnection as testAKDAPI, getAllAccountDetails as getAKDDetails } from './brokers/akdApiClient';

// Connection test implementation functions
async function testAKDConnection(credentials: Record<string, string>): Promise<boolean> {
  // Validate required credentials for AKD
  if (!credentials.username || !credentials.password) {
    throw new Error('Missing required credentials for AKD: username and password are required');
  }
  
  try {
    console.log(`Attempting to connect to AKD using username: ${credentials.username}`);
    
    // Use the imported testConnection function from the AKD API client
    const connectionResult = await testAKDAPI(credentials.username, credentials.password);
    
    if (connectionResult) {
      return true;
    }
    
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
      
      // Check if this connection already exists for the user
      const userConnections = await storage.getConnectionsByUserId(req.user!.id);
      const existingConnection = userConnections.find(conn => 
        conn.exchangeId === validatedData.exchangeId && 
        conn.brokerId === validatedData.brokerId
      );
      
      let connection;
      
      if (existingConnection) {
        // Update existing connection instead of creating a new one
        console.log(`Updating existing connection with ID ${existingConnection.id}`);
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
      
      if (req.body.isDefault !== undefined) {
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
  
  // Set a connection as default
  app.post("/api/connections/:id/set-default", async (req, res, next) => {
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
  
  // Implementation of AKD account details using the SOAP API client
  async function getAKDAccountDetails(credentials: Record<string, string>) {
    try {
      // Check if we have the minimum required credentials
      if (!credentials.username || !credentials.password) {
        throw new Error('Missing required credentials for AKD');
      }
      
      // Use our AKD API client to fetch real account details
      const accountDetails = await getAKDDetails(credentials.username, credentials.password);
      
      // Add any additional processing or mapping for the frontend if needed
      return accountDetails;
    } catch (error: any) {
      console.error('AKD account details error:', error);
      throw new Error(`Failed to fetch AKD account details: ${error.message}`);
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}

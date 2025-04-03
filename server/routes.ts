import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { connectionRequestSchema } from "@shared/schema";
import { z } from "zod";

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

  const httpServer = createServer(app);
  return httpServer;
}

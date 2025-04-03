import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
});

export const exchanges = pgTable("exchanges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // spot, futures
  marketType: text("market_type").notNull(), // equity, crypto, forex, commodity, metals
  requiresBroker: boolean("requires_broker").default(false),
});

export const brokers = pgTable("brokers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  exchangeId: integer("exchange_id").references(() => exchanges.id),
  authMethods: text("auth_methods").array(), // ["api", "credentials"]
});

export const connections = pgTable("connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  exchangeId: integer("exchange_id").references(() => exchanges.id).notNull(),
  brokerId: integer("broker_id").references(() => brokers.id),
  authMethod: text("auth_method").notNull(), // "api" or "credentials"
  credentials: jsonb("credentials").notNull(), // Encrypted credentials
  isActive: boolean("is_active").default(true),
  lastConnected: text("last_connected"),
  accountId: text("account_id"),
});

// User Schema
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  firstName: true,
  lastName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Exchange Schema
export const insertExchangeSchema = createInsertSchema(exchanges);
export type InsertExchange = z.infer<typeof insertExchangeSchema>;
export type Exchange = typeof exchanges.$inferSelect;

// Broker Schema
export const insertBrokerSchema = createInsertSchema(brokers);
export type InsertBroker = z.infer<typeof insertBrokerSchema>;
export type Broker = typeof brokers.$inferSelect;

// Connection Schema
export const insertConnectionSchema = createInsertSchema(connections);
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connections.$inferSelect;

// Login Schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

// Connection Request Schema
export const connectionRequestSchema = z.object({
  exchangeId: z.number(),
  brokerId: z.number().optional(),
  authMethod: z.enum(["api", "credentials"]),
  credentials: z.record(z.string(), z.string()),
});

export type ConnectionRequest = z.infer<typeof connectionRequestSchema>;

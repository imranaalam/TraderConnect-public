import { 
  User, InsertUser, Exchange, InsertExchange, 
  Broker, InsertBroker, Connection, InsertConnection 
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

// Define the storage interface
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getAllExchanges(): Promise<Exchange[]>;
  getExchange(id: number): Promise<Exchange | undefined>;
  getExchangesByMarketType(marketType: string): Promise<Exchange[]>;
  createExchange(exchange: InsertExchange): Promise<Exchange>;
  
  getAllBrokers(): Promise<Broker[]>;
  getBroker(id: number): Promise<Broker | undefined>;
  getBrokersByExchangeId(exchangeId: number): Promise<Broker[]>;
  createBroker(broker: InsertBroker): Promise<Broker>;
  
  getConnection(id: number): Promise<Connection | undefined>;
  getConnectionsByUserId(userId: number): Promise<Connection[]>;
  createConnection(connection: InsertConnection): Promise<Connection>;
  updateConnection(id: number, connection: Partial<Connection>): Promise<Connection | undefined>;
  deleteConnection(id: number): Promise<void>;
  
  sessionStore: session.SessionStore;
}

// Implement the in-memory storage
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private exchanges: Map<number, Exchange>;
  private brokers: Map<number, Broker>;
  private connections: Map<number, Connection>;
  sessionStore: session.SessionStore;
  
  private userIdCounter: number;
  private exchangeIdCounter: number;
  private brokerIdCounter: number;
  private connectionIdCounter: number;

  constructor() {
    this.users = new Map();
    this.exchanges = new Map();
    this.brokers = new Map();
    this.connections = new Map();
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // 24 hours
    });
    
    this.userIdCounter = 1;
    this.exchangeIdCounter = 1;
    this.brokerIdCounter = 1;
    this.connectionIdCounter = 1;
    
    // Initialize with sample exchanges and brokers
    this.initializeSampleData();
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Exchange methods
  async getAllExchanges(): Promise<Exchange[]> {
    return Array.from(this.exchanges.values());
  }

  async getExchange(id: number): Promise<Exchange | undefined> {
    return this.exchanges.get(id);
  }

  async getExchangesByMarketType(marketType: string): Promise<Exchange[]> {
    return Array.from(this.exchanges.values()).filter(
      (exchange) => exchange.marketType === marketType
    );
  }

  async createExchange(insertExchange: InsertExchange): Promise<Exchange> {
    const id = this.exchangeIdCounter++;
    const exchange: Exchange = { ...insertExchange, id };
    this.exchanges.set(id, exchange);
    return exchange;
  }

  // Broker methods
  async getAllBrokers(): Promise<Broker[]> {
    return Array.from(this.brokers.values());
  }

  async getBroker(id: number): Promise<Broker | undefined> {
    return this.brokers.get(id);
  }

  async getBrokersByExchangeId(exchangeId: number): Promise<Broker[]> {
    return Array.from(this.brokers.values()).filter(
      (broker) => broker.exchangeId === exchangeId
    );
  }

  async createBroker(insertBroker: InsertBroker): Promise<Broker> {
    const id = this.brokerIdCounter++;
    const broker: Broker = { ...insertBroker, id };
    this.brokers.set(id, broker);
    return broker;
  }

  // Connection methods
  async getConnection(id: number): Promise<Connection | undefined> {
    return this.connections.get(id);
  }

  async getConnectionsByUserId(userId: number): Promise<Connection[]> {
    return Array.from(this.connections.values()).filter(
      (connection) => connection.userId === userId
    );
  }

  async createConnection(insertConnection: InsertConnection): Promise<Connection> {
    const id = this.connectionIdCounter++;
    const connection: Connection = { ...insertConnection, id };
    this.connections.set(id, connection);
    return connection;
  }

  async updateConnection(id: number, connectionUpdate: Partial<Connection>): Promise<Connection | undefined> {
    const connection = this.connections.get(id);
    if (!connection) return undefined;
    
    const updatedConnection = { ...connection, ...connectionUpdate };
    this.connections.set(id, updatedConnection);
    return updatedConnection;
  }

  async deleteConnection(id: number): Promise<void> {
    this.connections.delete(id);
  }

  // Initialize sample data
  private initializeSampleData(): void {
    // Create demo user
    this.createUser({
      username: 'demo',
      password: '3e3c741f83418619d8a13ab424f0d985068df6d568f5ce224845a779338b88290ebd2bdb5273ed8a9e6802dd8e1e6c7d31a1df387993a08903878dfc1cf16e28.601b3042abd3d02ad6ed3a8c16ccb4ba', // "1234" hashed
      email: 'demo@example.com',
      firstName: 'Demo',
      lastName: 'User'
    });
    
    // Sample Exchanges
    const cryptoExchanges = [
      { name: 'Binance', type: 'spot', marketType: 'crypto', requiresBroker: false },
      { name: 'Coinbase', type: 'spot', marketType: 'crypto', requiresBroker: false },
      { name: 'Kraken', type: 'spot', marketType: 'crypto', requiresBroker: false },
      { name: 'Binance Futures', type: 'futures', marketType: 'crypto', requiresBroker: false },
    ];
    
    const equityExchanges = [
      { name: 'NYSE', type: 'spot', marketType: 'equity', requiresBroker: true },
      { name: 'NASDAQ', type: 'spot', marketType: 'equity', requiresBroker: true },
      { name: 'LSE', type: 'spot', marketType: 'equity', requiresBroker: true },
    ];
    
    const forexExchanges = [
      { name: 'Forex.com', type: 'spot', marketType: 'forex', requiresBroker: false },
      { name: 'OANDA', type: 'spot', marketType: 'forex', requiresBroker: false },
    ];
    
    const commodityExchanges = [
      { name: 'CME Group', type: 'futures', marketType: 'commodity', requiresBroker: true },
      { name: 'ICE', type: 'futures', marketType: 'commodity', requiresBroker: true },
    ];

    // Create exchanges
    [...cryptoExchanges, ...equityExchanges, ...forexExchanges, ...commodityExchanges].forEach(exchange => {
      this.createExchange(exchange as InsertExchange);
    });

    // Sample Brokers
    const equityBrokers = [
      { name: 'Interactive Brokers', exchangeId: 5, authMethods: ['api', 'credentials'] },
      { name: 'TD Ameritrade', exchangeId: 5, authMethods: ['api', 'credentials'] },
      { name: 'Charles Schwab', exchangeId: 5, authMethods: ['credentials'] },
      { name: 'Robinhood', exchangeId: 5, authMethods: ['api'] },
      
      { name: 'Interactive Brokers', exchangeId: 6, authMethods: ['api', 'credentials'] },
      { name: 'TD Ameritrade', exchangeId: 6, authMethods: ['api', 'credentials'] },
      { name: 'Charles Schwab', exchangeId: 6, authMethods: ['credentials'] },
      { name: 'Robinhood', exchangeId: 6, authMethods: ['api'] },
      
      { name: 'Interactive Brokers', exchangeId: 7, authMethods: ['api', 'credentials'] },
      { name: 'Hargreaves Lansdown', exchangeId: 7, authMethods: ['credentials'] },
    ];
    
    const commodityBrokers = [
      { name: 'Interactive Brokers', exchangeId: 10, authMethods: ['api', 'credentials'] },
      { name: 'TD Ameritrade', exchangeId: 10, authMethods: ['api', 'credentials'] },
      
      { name: 'Interactive Brokers', exchangeId: 11, authMethods: ['api', 'credentials'] },
      { name: 'ADMIS', exchangeId: 11, authMethods: ['credentials'] },
    ];

    // Create brokers
    [...equityBrokers, ...commodityBrokers].forEach(broker => {
      this.createBroker(broker as InsertBroker);
    });
  }
}

export const storage = new MemStorage();

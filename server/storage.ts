import { 
  User, InsertUser, Exchange, InsertExchange, 
  Broker, InsertBroker, Connection, InsertConnection 
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);
type SessionStore = ReturnType<typeof createMemoryStore>;

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
  
  sessionStore: SessionStore;
}

// Implement the in-memory storage
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private exchanges: Map<number, Exchange>;
  private brokers: Map<number, Broker>;
  private connections: Map<number, Connection>;
  sessionStore: SessionStore;
  
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
    const user: User = { 
      ...insertUser, 
      id,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null
    };
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
    const exchange: Exchange = { 
      ...insertExchange, 
      id,
      requiresBroker: insertExchange.requiresBroker || false
    };
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
    const broker: Broker = { 
      ...insertBroker, 
      id,
      exchangeId: insertBroker.exchangeId || null,
      authMethods: insertBroker.authMethods || []
    };
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
    
    // Check if this should be the default connection (first one for user)
    let isDefault = false;
    let hasExistingConnections = false;
    
    for (const conn of this.connections.values()) {
      if (conn.userId === insertConnection.userId) {
        hasExistingConnections = true;
        break;
      }
    }
    
    // If this is the first connection for the user, make it default
    if (!hasExistingConnections) {
      isDefault = true;
    }
    
    const connection: Connection = { 
      ...insertConnection, 
      id,
      brokerId: insertConnection.brokerId || null,
      accountId: insertConnection.accountId || null,
      isActive: insertConnection.isActive !== undefined ? insertConnection.isActive : true,
      isDefault: insertConnection.isDefault !== undefined ? insertConnection.isDefault : isDefault,
      lastConnected: insertConnection.lastConnected || null
    };
    this.connections.set(id, connection);
    return connection;
  }

  async updateConnection(id: number, connectionUpdate: Partial<Connection>): Promise<Connection | undefined> {
    const connection = this.connections.get(id);
    if (!connection) return undefined;
    
    // If setting this connection as default, unset any other default connections for this user
    if (connectionUpdate.isDefault) {
      // Find all connections for this user
      for (const [connId, conn] of this.connections.entries()) {
        if (conn.userId === connection.userId && conn.isDefault && connId !== id) {
          // Unset default on other connections
          const updatedConn = { ...conn, isDefault: false };
          this.connections.set(connId, updatedConn);
        }
      }
    }
    
    const updatedConnection = { ...connection, ...connectionUpdate };
    this.connections.set(id, updatedConnection);
    return updatedConnection;
  }

  async deleteConnection(id: number): Promise<void> {
    this.connections.delete(id);
  }

  // Initialize sample data
  private initializeSampleData(): void {
    // Create demo users
    // "1234" hashed with salt
    const demoPasswordHash = '3e3c741f83418619d8a13ab424f0d985068df6d568f5ce224845a779338b88290ebd2bdb5273ed8a9e6802dd8e1e6c7d31a1df387993a08903878dfc1cf16e28.601b3042abd3d02ad6ed3a8c16ccb4ba';
    
    // Main demo user
    this.createUser({
      username: 'demo',
      password: demoPasswordHash,
      email: 'demo@example.com',
      firstName: 'Demo',
      lastName: 'User'
    });
    
    // Additional users with the same password for testing
    this.createUser({
      username: 'jawadfoq',
      password: demoPasswordHash,
      email: 'jawad@example.com',
      firstName: 'Jawad',
      lastName: 'Foqan'
    });
    
    this.createUser({
      username: 'demo_akd',
      password: demoPasswordHash,
      email: 'akd@example.com',
      firstName: 'AKD',
      lastName: 'Demo'
    });
    
    this.createUser({
      username: 'trader1',
      password: demoPasswordHash,
      email: 'trader1@example.com',
      firstName: 'Pro',
      lastName: 'Trader'
    });
    
    // Define market types and their respective exchanges
    const marketTypes = [
      {
        type: 'crypto',
        exchanges: [
          { name: 'Binance', type: 'spot', requiresBroker: false },
          { name: 'Coinbase', type: 'spot', requiresBroker: false },
          { name: 'Kraken', type: 'spot', requiresBroker: false },
          { name: 'Binance Futures', type: 'futures', requiresBroker: false },
        ]
      },
      {
        type: 'equity',
        exchanges: [
          { name: 'NYSE', type: 'spot', requiresBroker: true },
          { name: 'NASDAQ', type: 'spot', requiresBroker: true },
          { name: 'LSE', type: 'spot', requiresBroker: true },
          { name: 'PSX', type: 'spot', requiresBroker: true }, // Pakistan Stock Exchange
          { name: 'NSE', type: 'spot', requiresBroker: true }, // National Stock Exchange of India
        ]
      },
      {
        type: 'forex',
        exchanges: [
          { name: 'Forex.com', type: 'spot', requiresBroker: false },
          { name: 'OANDA', type: 'spot', requiresBroker: false },
        ]
      },
      {
        type: 'commodity',
        exchanges: [
          { name: 'CME Group', type: 'futures', requiresBroker: true },
          { name: 'ICE', type: 'futures', requiresBroker: true },
        ]
      },
      {
        type: 'metals',
        exchanges: [
          { name: 'COMEX', type: 'futures', requiresBroker: true },
          { name: 'LME', type: 'spot', requiresBroker: true },
        ]
      }
    ];

    // Create exchanges with their respective market types
    const exchangeIdMap = new Map<string, number>();
    
    marketTypes.forEach(market => {
      market.exchanges.forEach(exchange => {
        const exchangeData = {
          name: exchange.name,
          type: exchange.type,
          marketType: market.type,
          requiresBroker: exchange.requiresBroker
        };
        
        // Create the exchange and store its ID for broker mapping
        this.createExchange(exchangeData as InsertExchange)
          .then(createdExchange => {
            exchangeIdMap.set(createdExchange.name, createdExchange.id);
          });
      });
    });

    // Wait a bit to ensure exchanges are created before creating brokers
    setTimeout(() => {
      // Define broker mappings by exchange name
      const brokerMappings = [
        // US equity brokers
        { 
          exchangeName: 'NYSE', 
          brokers: [
            { name: 'Interactive Brokers', authMethods: ['api', 'credentials'] },
            { name: 'TD Ameritrade', authMethods: ['api', 'credentials'] },
            { name: 'Charles Schwab', authMethods: ['credentials'] },
            { name: 'Robinhood', authMethods: ['api'] }
          ]
        },
        { 
          exchangeName: 'NASDAQ', 
          brokers: [
            { name: 'Interactive Brokers', authMethods: ['api', 'credentials'] },
            { name: 'TD Ameritrade', authMethods: ['api', 'credentials'] },
            { name: 'Fidelity', authMethods: ['credentials'] },
            { name: 'E*TRADE', authMethods: ['api', 'credentials'] }
          ]
        },
        // UK brokers
        { 
          exchangeName: 'LSE', 
          brokers: [
            { name: 'Interactive Brokers', authMethods: ['api', 'credentials'] },
            { name: 'Hargreaves Lansdown', authMethods: ['credentials'] }
          ]
        },
        // Pakistan brokers (PSX)
        { 
          exchangeName: 'PSX', 
          brokers: [
            { name: 'AKD', authMethods: ['credentials'] },
            { name: 'MKK', authMethods: ['credentials'] }
          ]
        },
        // India brokers (NSE)
        { 
          exchangeName: 'NSE', 
          brokers: [
            { name: 'Zerodha', authMethods: ['api', 'credentials'] },
            { name: 'ICICI Direct', authMethods: ['credentials'] },
            { name: 'Angel Broking', authMethods: ['api', 'credentials'] }
          ]
        },
        // Commodity brokers
        { 
          exchangeName: 'CME Group', 
          brokers: [
            { name: 'Interactive Brokers', authMethods: ['api', 'credentials'] },
            { name: 'TD Ameritrade', authMethods: ['api', 'credentials'] }
          ]
        },
        { 
          exchangeName: 'ICE', 
          brokers: [
            { name: 'Interactive Brokers', authMethods: ['api', 'credentials'] },
            { name: 'ADMIS', authMethods: ['credentials'] }
          ]
        },
        // Metals brokers
        { 
          exchangeName: 'COMEX', 
          brokers: [
            { name: 'Interactive Brokers', authMethods: ['api', 'credentials'] },
            { name: 'TD Ameritrade', authMethods: ['api', 'credentials'] }
          ]
        },
        { 
          exchangeName: 'LME', 
          brokers: [
            { name: 'Interactive Brokers', authMethods: ['api', 'credentials'] },
            { name: 'Sucden Financial', authMethods: ['credentials'] }
          ]
        }
      ];

      // Create brokers based on exchange mappings
      brokerMappings.forEach(mapping => {
        const exchangeId = exchangeIdMap.get(mapping.exchangeName);
        if (exchangeId) {
          mapping.brokers.forEach(broker => {
            this.createBroker({
              name: broker.name,
              exchangeId: exchangeId,
              authMethods: broker.authMethods
            } as InsertBroker);
          });
        }
      });
    }, 100);  // Small delay to ensure exchanges are created first
  }
}

export const storage = new MemStorage();

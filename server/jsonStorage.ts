
import fs from 'fs/promises';
import path from 'path';
import { IStorage, User, InsertUser, Exchange, InsertExchange, Broker, InsertBroker, Connection, InsertConnection } from '@shared/schema';
import session from 'express-session';
import createMemoryStore from 'memorystore';

const MemoryStore = createMemoryStore(session);

export class JsonStorage implements IStorage {
  private dataPath: string;
  sessionStore: ReturnType<typeof createMemoryStore>;

  constructor() {
    this.dataPath = path.join(process.cwd(), 'data');
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000
    });
    this.initializeStorage();
  }

  private async initializeStorage() {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      
      // Initialize files if they don't exist
      const files = ['users.json', 'exchanges.json', 'brokers.json', 'connections.json'];
      for (const file of files) {
        try {
          await fs.access(path.join(this.dataPath, file));
        } catch {
          await fs.writeFile(path.join(this.dataPath, file), '[]');
        }
      }
    } catch (error) {
      console.error('Failed to initialize storage:', error);
    }
  }

  private async readJson<T>(filename: string): Promise<T[]> {
    try {
      const data = await fs.readFile(path.join(this.dataPath, filename), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async writeJson<T>(filename: string, data: T[]): Promise<void> {
    await fs.writeFile(
      path.join(this.dataPath, filename),
      JSON.stringify(data, null, 2)
    );
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const users = await this.readJson<User>('users.json');
    return users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const users = await this.readJson<User>('users.json');
    return users.find(u => u.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const users = await this.readJson<User>('users.json');
    return users.find(u => u.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const users = await this.readJson<User>('users.json');
    const id = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
    const user: User = { ...insertUser, id };
    users.push(user);
    await this.writeJson('users.json', users);
    return user;
  }

  // Exchange methods
  async getAllExchanges(): Promise<Exchange[]> {
    return this.readJson<Exchange>('exchanges.json');
  }

  async getExchange(id: number): Promise<Exchange | undefined> {
    const exchanges = await this.readJson<Exchange>('exchanges.json');
    return exchanges.find(e => e.id === id);
  }

  async getExchangesByMarketType(marketType: string): Promise<Exchange[]> {
    const exchanges = await this.readJson<Exchange>('exchanges.json');
    return exchanges.filter(e => e.marketType === marketType);
  }

  async createExchange(exchange: InsertExchange): Promise<Exchange> {
    const exchanges = await this.readJson<Exchange>('exchanges.json');
    const id = exchanges.length > 0 ? Math.max(...exchanges.map(e => e.id)) + 1 : 1;
    const newExchange: Exchange = { ...exchange, id };
    exchanges.push(newExchange);
    await this.writeJson('exchanges.json', exchanges);
    return newExchange;
  }

  // Broker methods  
  async getAllBrokers(): Promise<Broker[]> {
    return this.readJson<Broker>('brokers.json');
  }

  async getBroker(id: number): Promise<Broker | undefined> {
    const brokers = await this.readJson<Broker>('brokers.json');
    return brokers.find(b => b.id === id);
  }

  async getBrokersByExchangeId(exchangeId: number): Promise<Broker[]> {
    const brokers = await this.readJson<Broker>('brokers.json');
    return brokers.filter(b => b.exchangeId === exchangeId);
  }

  async createBroker(broker: InsertBroker): Promise<Broker> {
    const brokers = await this.readJson<Broker>('brokers.json');
    const id = brokers.length > 0 ? Math.max(...brokers.map(b => b.id)) + 1 : 1;
    const newBroker: Broker = { ...broker, id };
    brokers.push(newBroker);
    await this.writeJson('brokers.json', brokers);
    return newBroker;
  }

  // Connection methods
  async getConnection(id: number): Promise<Connection | undefined> {
    const connections = await this.readJson<Connection>('connections.json');
    return connections.find(c => c.id === id);
  }

  async getConnectionsByUserId(userId: number): Promise<Connection[]> {
    const connections = await this.readJson<Connection>('connections.json');
    return connections.filter(c => c.userId === userId);
  }

  async createConnection(connection: InsertConnection): Promise<Connection> {
    const connections = await this.readJson<Connection>('connections.json');
    const id = connections.length > 0 ? Math.max(...connections.map(c => c.id)) + 1 : 1;
    const newConnection: Connection = { ...connection, id };
    connections.push(newConnection);
    await this.writeJson('connections.json', connections);
    return newConnection;
  }

  async updateConnection(id: number, update: Partial<Connection>): Promise<Connection | undefined> {
    const connections = await this.readJson<Connection>('connections.json');
    const index = connections.findIndex(c => c.id === id);
    if (index === -1) return undefined;
    
    connections[index] = { ...connections[index], ...update };
    await this.writeJson('connections.json', connections);
    return connections[index];
  }

  async deleteConnection(id: number): Promise<void> {
    const connections = await this.readJson<Connection>('connections.json');
    const filtered = connections.filter(c => c.id !== id);
    await this.writeJson('connections.json', filtered);
  }
}

export const storage = new JsonStorage();
